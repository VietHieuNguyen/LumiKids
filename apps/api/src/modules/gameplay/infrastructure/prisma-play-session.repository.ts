import { Injectable } from '@nestjs/common';
import { gameInteractionSchema } from '@lumikids/shared';
import type { GameInteraction } from '@lumikids/shared';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { PlaySessionRepository } from '../application/play-session.repository.js';
import type {
  AppendCommit,
  PlaySessionRecord,
  StartSessionData,
} from '../application/play-session.repository.js';

const sessionSelect = {
  sessionId: true,
  assignmentId: true,
  versionId: true,
  status: true,
  eventCount: true,
  startedAt: true,
  endedAt: true,
  childId: true,
} as const satisfies Prisma.PlaySessionSelect;
type SessionRow = Prisma.PlaySessionGetPayload<{
  select: typeof sessionSelect;
}>;
type EventRow = Prisma.InteractionEventGetPayload<object>;

function toRecord(row: SessionRow): PlaySessionRecord {
  return row;
}

export function toInteraction(row: EventRow): GameInteraction {
  const action = row.actionData as {
    sourceId: string;
    targetId?: string;
    count?: number;
  };
  return gameInteractionSchema.parse({
    schemaVersion: row.schemaVersion,
    eventId: row.eventId,
    actionType: row.eventType,
    sourceId: action.sourceId,
    ...(action.targetId === undefined ? {} : { targetId: action.targetId }),
    ...(action.count === undefined ? {} : { count: action.count }),
    ...(row.result === null ? {} : { result: row.result }),
    timestamp: row.clientTimestamp.toISOString(),
    attemptIndex: row.attemptIndex,
  });
}

export function toEventData(
  sessionId: string,
  event: GameInteraction,
): Prisma.InteractionEventCreateManyInput {
  return {
    eventId: event.eventId,
    sessionId,
    eventType: event.actionType,
    actionData:
      'count' in event
        ? { sourceId: event.sourceId, count: event.count }
        : 'targetId' in event
          ? { sourceId: event.sourceId, targetId: event.targetId }
          : { sourceId: event.sourceId },
    result: 'result' in event ? event.result : null,
    attemptIndex: event.attemptIndex,
    schemaVersion: event.schemaVersion,
    clientTimestamp: new Date(event.timestamp),
  };
}

@Injectable()
export class PrismaPlaySessionRepository extends PlaySessionRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }
  async findById(sessionId: string) {
    const row = await this.prisma.playSession.findUnique({
      where: { sessionId },
      select: sessionSelect,
    });
    return row && toRecord(row);
  }
  async findByStartRequest(childId: string, startRequestId: string) {
    const row = await this.prisma.playSession.findUnique({
      where: { childId_startRequestId: { childId, startRequestId } },
      select: sessionSelect,
    });
    return row && toRecord(row);
  }
  async start(data: StartSessionData) {
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.playSession.updateMany({
        where: { childId: data.childId, status: 'IN_PROGRESS' },
        data: { status: 'ABANDONED', endedAt: new Date() },
      });
      return tx.playSession.create({ data, select: sessionSelect });
    });
    return toRecord(row);
  }
  async listInteractions(sessionId: string) {
    const rows = await this.prisma.interactionEvent.findMany({
      where: { sessionId },
      orderBy: { attemptIndex: 'asc' },
    });
    return rows.map(toInteraction);
  }
  async findForeignEventIds(sessionId: string, eventIds: readonly string[]) {
    const rows = await this.prisma.interactionEvent.findMany({
      where: { eventId: { in: [...eventIds] }, sessionId: { not: sessionId } },
      select: { eventId: true },
    });
    return rows.map((row) => row.eventId);
  }
  async commitAppend(commit: AppendCommit) {
    const completion = commit.completion;
    const now = completion?.completedAt ?? new Date();
    try {
      return await this.prisma.$transaction(async (tx) => {
        // The IN_PROGRESS + eventCount guard lets exactly one request complete the session.
        const updated = await tx.playSession.updateMany({
          where: {
            sessionId: commit.sessionId,
            status: 'IN_PROGRESS',
            eventCount: commit.expectedEventCount,
          },
          data: {
            eventCount: commit.expectedEventCount + commit.accepted.length,
            lastEventAt: now,
            ...(completion
              ? {
                  status: 'COMPLETED',
                  endedAt: now,
                  performance: completion.performance,
                }
              : {}),
          },
        });
        if (updated.count === 0) return false;
        await tx.interactionEvent.createMany({
          data: commit.accepted.map((event) =>
            toEventData(commit.sessionId, event),
          ),
        });
        if (completion?.evaluation)
          // sessionId is unique: a second evaluation for the session fails the whole commit.
          await tx.criterionEvaluation.create({
            data: { sessionId: commit.sessionId, ...completion.evaluation },
          });
        return true;
      });
    } catch (error) {
      // A concurrent request inserted the same eventId/attemptIndex; caller reloads.
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      )
        return false;
      throw error;
    }
  }
  async primaryCriterionCode(versionId: string) {
    const row = await this.prisma.activityVersionCriterion.findFirst({
      where: { versionId },
      orderBy: { criterionCode: 'asc' },
      select: { criterionCode: true },
    });
    return row?.criterionCode ?? null;
  }
  async finishedPlays(childId: string, limit: number) {
    const rows = await this.prisma.playSession.findMany({
      where: { childId, status: 'COMPLETED', endedAt: { not: null } },
      orderBy: { endedAt: 'desc' },
      take: limit,
      select: {
        versionId: true,
        endedAt: true,
        version: {
          select: { gameType: true, activity: { select: { name: true } } },
        },
      },
    });
    return rows.map((row) => ({
      versionId: row.versionId,
      title: row.version.activity.name,
      gameType: row.version.gameType,
      endedAt: row.endedAt as Date,
    }));
  }
  async currentClassroom(childId: string) {
    const enrollment = await this.prisma.classroomEnrollment.findFirst({
      where: { childId, endedAt: null },
      select: {
        classroom: {
          select: {
            className: true,
            teachers: {
              orderBy: { teacher: { fullName: 'asc' } },
              select: { teacher: { select: { fullName: true } } },
            },
          },
        },
      },
    });
    if (!enrollment) return null;
    return {
      className: enrollment.classroom.className,
      teacherNames: enrollment.classroom.teachers.map(
        ({ teacher }) => teacher.fullName,
      ),
    };
  }
  async abandon(sessionId: string) {
    await this.prisma.playSession.updateMany({
      where: { sessionId, status: 'IN_PROGRESS' },
      data: { status: 'ABANDONED', endedAt: new Date() },
    });
  }
}
