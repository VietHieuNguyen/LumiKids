import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { LessonPlanStatus } from '../../generated/prisma/enums.js';

const summarySelect = {
  lessonPlanId: true,
  title: true,
  topic: true,
  ageGroupId: true,
  ageGroup: { select: { name: true } },
  skillCode: true,
  skill: { select: { name: true } },
  durationMinutes: true,
  status: true,
  revision: true,
  createdAt: true,
  updatedAt: true,
  blocks: { select: { versionId: true } },
} as const satisfies Prisma.LessonPlanSelect;

const detailSelect = {
  ...summarySelect,
  objectives: true,
  preparation: true,
  evaluation: true,
  sourceLessonPlanId: true,
  editor: { select: { fullName: true } },
  blocks: {
    orderBy: { position: 'asc' },
    select: {
      blockId: true,
      position: true,
      title: true,
      instruction: true,
      durationMinutes: true,
      versionId: true,
      version: {
        select: {
          versionId: true,
          gameType: true,
          activity: { select: { name: true, status: true } },
        },
      },
    },
  },
} as const satisfies Prisma.LessonPlanSelect;

export type LessonPlanSummaryRow = Prisma.LessonPlanGetPayload<{ select: typeof summarySelect }>;
export type LessonPlanRow = Prisma.LessonPlanGetPayload<{ select: typeof detailSelect }>;

export interface LessonPlanData {
  title: string;
  topic: string;
  ageGroupId: string | null;
  skillCode: string | null;
  durationMinutes: number | null;
  objectives: string;
  preparation: string;
  evaluation: string;
  status: LessonPlanStatus;
  blocks: {
    title: string;
    instruction: string;
    durationMinutes: number | null;
    versionId: string | null;
  }[];
}

/** A teacher's own lesson plans. Blocks are rewritten as a whole on every save, in order. */
@Injectable()
export class LessonPlansRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(
    ownerId: string,
    filter: { search: string; status?: LessonPlanStatus; ageGroupId?: string; skillCode?: string },
  ) {
    return this.prisma.lessonPlan.findMany({
      where: {
        createdBy: ownerId,
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.ageGroupId ? { ageGroupId: filter.ageGroupId } : {}),
        ...(filter.skillCode ? { skillCode: filter.skillCode } : {}),
        ...(filter.search
          ? {
              OR: [
                { title: { contains: filter.search, mode: 'insensitive' } },
                { topic: { contains: filter.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: summarySelect,
      orderBy: [{ updatedAt: 'desc' }, { lessonPlanId: 'asc' }],
      take: 200,
    });
  }

  find(ownerId: string, lessonPlanId: string) {
    return this.prisma.lessonPlan.findFirst({
      where: { lessonPlanId, createdBy: ownerId },
      select: detailSelect,
    });
  }

  ageGroupExists(ageGroupId: string) {
    return this.prisma.ageGroup.count({ where: { ageGroupId } });
  }
  skillExists(skillCode: string) {
    return this.prisma.skill.count({ where: { skillCode } });
  }
  /** Versions that may be newly attached: the game is still ACTIVE in the library. */
  activeVersionIds(versionIds: readonly string[]) {
    return this.prisma.activityVersion.findMany({
      where: { versionId: { in: [...versionIds] }, activity: { status: 'ACTIVE' } },
      select: { versionId: true },
    });
  }

  async create(
    ownerId: string,
    data: LessonPlanData,
    sourceLessonPlanId: string | null = null,
  ): Promise<string> {
    const { blocks, ...fields } = data;
    const row = await this.prisma.lessonPlan.create({
      data: {
        ...fields,
        sourceLessonPlanId,
        createdBy: ownerId,
        updatedBy: ownerId,
        blocks: { create: blocks.map((block, position) => ({ ...block, position })) },
      },
      select: { lessonPlanId: true },
    });
    return row.lessonPlanId;
  }

  /**
   * Saves only if the stored revision is still `revision` (optimistic lock); false on a conflict.
   * The revision check and the block rewrite are one transaction.
   */
  async save(
    lessonPlanId: string,
    editorId: string,
    revision: number,
    data: LessonPlanData,
  ): Promise<boolean> {
    const { blocks, ...fields } = data;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.lessonPlan.updateMany({
        where: { lessonPlanId, revision },
        data: { ...fields, updatedBy: editorId, revision: { increment: 1 } },
      });
      if (updated.count !== 1) return false;
      await tx.lessonBlock.deleteMany({ where: { lessonPlanId } });
      if (blocks.length)
        await tx.lessonBlock.createMany({
          data: blocks.map((block, position) => ({ ...block, position, lessonPlanId })),
        });
      return true;
    });
  }

  async remove(lessonPlanId: string): Promise<void> {
    await this.prisma.lessonPlan.delete({ where: { lessonPlanId } });
  }
}
