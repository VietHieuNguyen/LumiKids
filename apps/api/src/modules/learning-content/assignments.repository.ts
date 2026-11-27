import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AssignmentTargetType } from '../../generated/prisma/enums.js';

const versionSelect = {
  versionId: true,
  gameType: true,
  difficulty: true,
  content: true,
  activity: {
    select: {
      name: true,
      status: true,
      ageGroup: { select: { name: true, minAge: true, maxAge: true } },
    },
  },
} as const satisfies Prisma.ActivityVersionSelect;

const assignmentInclude = {
  creator: { select: { fullName: true } },
  items: {
    orderBy: { position: 'asc' },
    select: { version: { select: versionSelect } },
  },
  recipients: {
    select: {
      recipientId: true,
      childId: true,
      extendedUntil: true,
      replayRequests: {
        where: { status: 'PENDING' },
        select: { requestId: true, requestedAt: true },
      },
    },
  },
} as const satisfies Prisma.ActivityAssignmentInclude;

export type AssignmentVersion = Prisma.ActivityVersionGetPayload<{
  select: typeof versionSelect;
}>;
export type AssignmentRow = Prisma.ActivityAssignmentGetPayload<{
  include: typeof assignmentInclude;
}>;
export interface SessionFact {
  childId: string;
  assignmentId: string | null;
  versionId: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
  startedAt: Date;
}

@Injectable()
export class AssignmentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Versions whose game is still ACTIVE in the library (only these may be assigned). */
  playableVersions(versionIds: readonly string[]) {
    return this.prisma.activityVersion.findMany({
      where: {
        versionId: { in: [...versionIds] },
        activity: { status: 'ACTIVE' },
      },
      select: versionSelect,
    });
  }

  /** Birthdays for the age check (R-01). */
  childDobs(childIds: readonly string[]) {
    return this.prisma.child.findMany({
      where: { childId: { in: [...childIds] } },
      select: { childId: true, fullName: true, dob: true },
    });
  }

  async create(data: {
    source?: 'TEACHER' | 'GUARDIAN';
    classId: string | null;
    title: string;
    note: string;
    createdBy: string;
    opensAt: Date;
    dueAt: Date | null;
    targetType: AssignmentTargetType;
    targetLabel: string;
    versionIds: readonly string[];
    childIds: readonly string[];
  }): Promise<string> {
    const { versionIds, childIds, ...fields } = data;
    const row = await this.prisma.activityAssignment.create({
      data: {
        ...fields,
        items: {
          create: versionIds.map((versionId, position) => ({
            versionId,
            position,
          })),
        },
        recipients: { create: childIds.map((childId) => ({ childId })) },
      },
      select: { assignmentId: true },
    });
    return row.assignmentId;
  }

  listForClass(classId: string) {
    return this.prisma.activityAssignment.findMany({
      where: { classId },
      include: assignmentInclude,
      orderBy: [{ opensAt: 'desc' }, { assignmentId: 'asc' }],
      take: 100,
    });
  }
  /** Family picks of one child (newest first). */
  listFamilyPicks(childId: string) {
    return this.prisma.activityAssignment.findMany({
      where: { source: 'GUARDIAN', recipients: { some: { childId } } },
      include: assignmentInclude,
      orderBy: [{ opensAt: 'desc' }, { assignmentId: 'asc' }],
      take: 50,
    });
  }
  findFamilyPick(childId: string, assignmentId: string) {
    return this.prisma.activityAssignment.findFirst({
      where: {
        assignmentId,
        source: 'GUARDIAN',
        recipients: { some: { childId } },
      },
      select: { assignmentId: true, status: true },
    });
  }
  find(classId: string, assignmentId: string) {
    return this.prisma.activityAssignment.findFirst({
      where: { classId, assignmentId },
      include: assignmentInclude,
    });
  }
  async update(
    assignmentId: string,
    data: {
      title?: string;
      note?: string;
      dueAt?: Date | null;
      status?: 'CANCELLED';
    },
  ): Promise<void> {
    await this.prisma.activityAssignment.update({
      where: { assignmentId },
      data,
    });
  }
  async extend(
    assignmentId: string,
    childIds: readonly string[],
    until: Date,
  ): Promise<number> {
    const result = await this.prisma.activityRecipient.updateMany({
      where: { assignmentId, childId: { in: [...childIds] } },
      data: { extendedUntil: until },
    });
    return result.count;
  }

  /**
   * Play facts for progress. PlaySession belongs to gameplay; this read-only query stays here because
   * gameplay already depends on learning-content (a module back-reference would be circular).
   */
  sessions(
    childIds: readonly string[],
    versionIds: readonly string[],
    since: Date,
  ): Promise<SessionFact[]> {
    if (!childIds.length || !versionIds.length) return Promise.resolve([]);
    return this.prisma.playSession.findMany({
      where: {
        childId: { in: [...childIds] },
        versionId: { in: [...versionIds] },
        startedAt: { gte: since },
      },
      select: {
        childId: true,
        assignmentId: true,
        versionId: true,
        status: true,
        startedAt: true,
      },
    });
  }

  // ---------- Child ----------

  /**
   * Opened assignments of a child: the guardian's family picks always, plus the current class's teacher
   * assignments when the child is in a class. Work from a previous class is never returned.
   */
  forChild(childId: string, classId: string | null, now: Date) {
    return this.prisma.activityRecipient.findMany({
      where: {
        childId,
        assignment: {
          // Home practice is always included; class work only from the current class.
          OR: [
            { classId: null, source: 'GUARDIAN' },
            ...(classId ? [{ classId, source: 'TEACHER' as const }] : []),
          ],
          status: 'ACTIVE',
          opensAt: { lte: now },
        },
      },
      select: {
        recipientId: true,
        child: { select: { dob: true } },
        extendedUntil: true,
        replayRequests: {
          orderBy: { requestedAt: 'desc' },
          take: 1,
          select: { status: true, requestedAt: true, grantedUntil: true },
        },
        assignment: {
          select: {
            assignmentId: true,
            source: true,
            title: true,
            note: true,
            status: true,
            opensAt: true,
            dueAt: true,
            items: {
              orderBy: { position: 'asc' },
              select: { version: { select: versionSelect } },
            },
          },
        },
      },
      orderBy: { assignment: { opensAt: 'desc' } },
      take: 60,
    });
  }
  findRecipient(childId: string, assignmentId: string) {
    return this.prisma.activityRecipient.findUnique({
      where: { assignmentId_childId: { assignmentId, childId } },
      select: {
        recipientId: true,
        extendedUntil: true,
        assignment: {
          select: { classId: true, status: true, opensAt: true, dueAt: true },
        },
      },
    });
  }

  findRecipientGame(childId: string, assignmentId: string, versionId: string) {
    return this.prisma.activityRecipient.findUnique({
      where: { assignmentId_childId: { assignmentId, childId } },
      select: {
        child: { select: { dob: true } },
        extendedUntil: true,
        assignment: {
          select: {
            classId: true,
            source: true,
            status: true,
            opensAt: true,
            dueAt: true,
            items: {
              where: { versionId, version: { activity: { status: 'ACTIVE' } } },
              select: { version: { select: versionSelect } },
            },
          },
        },
      },
    });
  }
  /** Idempotent: a second request while one is pending returns the pending one (partial unique index). */
  async requestReplay(recipientId: string) {
    const pending = await this.prisma.replayRequest.findFirst({
      where: { recipientId, status: 'PENDING' },
      select: { status: true, requestedAt: true, grantedUntil: true },
    });
    if (pending) return pending;
    try {
      return await this.prisma.replayRequest.create({
        data: { recipientId },
        select: { status: true, requestedAt: true, grantedUntil: true },
      });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        const raced = await this.prisma.replayRequest.findFirst({
          where: { recipientId, status: 'PENDING' },
          select: { status: true, requestedAt: true, grantedUntil: true },
        });
        if (raced) return raced;
      }
      throw error;
    }
  }
  findRequest(assignmentId: string, requestId: string) {
    return this.prisma.replayRequest.findFirst({
      where: { requestId, recipient: { assignmentId } },
      select: { requestId: true, status: true, recipientId: true },
    });
  }
  /** Decides a pending request; false when someone decided it first. Approval extends the child's deadline. */
  decide(
    request: { requestId: string; recipientId: string },
    decision: {
      approve: boolean;
      until: Date | null;
      decidedBy: string;
      now: Date;
    },
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.replayRequest.updateMany({
        where: { requestId: request.requestId, status: 'PENDING' },
        data: {
          status: decision.approve ? 'APPROVED' : 'REJECTED',
          decidedAt: decision.now,
          decidedBy: decision.decidedBy,
          grantedUntil: decision.approve ? decision.until : null,
        },
      });
      if (updated.count !== 1) return false;
      if (decision.approve)
        await tx.activityRecipient.update({
          where: { recipientId: request.recipientId },
          data: { extendedUntil: decision.until },
        });
      return true;
    });
  }
}
