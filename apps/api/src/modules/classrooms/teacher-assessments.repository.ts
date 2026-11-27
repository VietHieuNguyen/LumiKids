import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

const assessmentSelect = {
  assessmentId: true,
  childId: true,
  classId: true,
  authorId: true,
  criterionCode: true,
  periodStart: true,
  periodEnd: true,
  content: true,
  status: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { fullName: true } },
  _count: { select: { revisions: true } },
} as const satisfies Prisma.TeacherAssessmentSelect;

export type AssessmentRow = Prisma.TeacherAssessmentGetPayload<{
  select: typeof assessmentSelect;
}>;

export interface AssessmentSnapshot {
  criterionCode: string;
  periodStart: Date;
  periodEnd: Date;
  content: string;
  status: 'DRAFT' | 'PUBLISHED';
}

/** Teacher assessments of a child. The service checks who may call; this only reads and writes. */
@Injectable()
export class TeacherAssessmentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(childId: string) {
    return this.prisma.teacherAssessment.findMany({
      where: { childId },
      select: assessmentSelect,
      orderBy: [{ periodEnd: 'desc' }, { createdAt: 'desc' }, { assessmentId: 'asc' }],
    });
  }

  find(childId: string, assessmentId: string) {
    return this.prisma.teacherAssessment.findFirst({
      where: { assessmentId, childId },
      select: assessmentSelect,
    });
  }

  async revisions(assessmentId: string) {
    const rows = await this.prisma.teacherAssessmentRevision.findMany({
      where: { assessmentId },
      orderBy: { revisionNo: 'asc' },
      select: { revisionNo: true, changedBy: true, changedAt: true, reason: true, previous: true },
    });
    const users = await this.prisma.user.findMany({
      where: { userId: { in: [...new Set(rows.map((row) => row.changedBy))] } },
      select: { userId: true, fullName: true },
    });
    const names = new Map(users.map((user) => [user.userId, user.fullName]));
    return rows.map((row) => ({
      revisionNo: row.revisionNo,
      changedAt: row.changedAt,
      changedByName: names.get(row.changedBy) ?? '',
      reason: row.reason,
      previous: row.previous as unknown as AssessmentSnapshot & { periodStart: string; periodEnd: string },
    }));
  }

  create(data: {
    childId: string;
    classId: string;
    authorId: string;
    criterionCode: string;
    periodStart: Date;
    periodEnd: Date;
    content: string;
  }) {
    return this.prisma.teacherAssessment.create({ data, select: assessmentSelect });
  }

  /** Saves the edit and the replaced values together, so a revision never exists without its change. */
  async update(
    assessmentId: string,
    patch: Partial<AssessmentSnapshot>,
    revision: { changedBy: string; reason: string | null; previous: AssessmentSnapshot },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const count = await tx.teacherAssessmentRevision.count({ where: { assessmentId } });
      await tx.teacherAssessmentRevision.create({
        data: {
          assessmentId,
          revisionNo: count + 1,
          changedBy: revision.changedBy,
          reason: revision.reason,
          previous: {
            criterionCode: revision.previous.criterionCode,
            periodStart: revision.previous.periodStart.toISOString().slice(0, 10),
            periodEnd: revision.previous.periodEnd.toISOString().slice(0, 10),
            content: revision.previous.content,
            status: revision.previous.status,
          },
        },
      });
      return tx.teacherAssessment.update({
        where: { assessmentId },
        data: patch,
        select: assessmentSelect,
      });
    });
  }

  /** Only a draft moves to published; the status check is part of the write, so two publishes cannot both win. */
  async publish(assessmentId: string, now: Date) {
    const result = await this.prisma.teacherAssessment.updateMany({
      where: { assessmentId, status: 'DRAFT' },
      data: { status: 'PUBLISHED', publishedAt: now },
    });
    return result.count === 1;
  }

  async deleteDraft(assessmentId: string) {
    const result = await this.prisma.teacherAssessment.deleteMany({
      where: { assessmentId, status: 'DRAFT' },
    });
    return result.count === 1;
  }
}
