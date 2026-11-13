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
  versionId: true,
  status: true,
  eventCount: true,
  startedAt: true,
  endedAt: true,
  child: { select: { userId: true } },
} as const satisfies Prisma.PlaySessionSelect;
type SessionRow = Prisma.PlaySessionGetPayload<{
  select: typeof sessionSelect;
}>;
type EventRow = Prisma.InteractionEventGetPayload<object>;

function toRecord({ child, ...row }: SessionRow): PlaySessionRecord {
  return { ...row, ownerUserId: child.userId };
}

function toInteraction(row: EventRow): GameInteraction {
  const action = row.actionData as { sourceId: string; targetId?: string };
  return gameInteractionSchema.parse({
    schemaVersion: row.schemaVersion,
    eventId: row.eventId,
    actionType: row.eventType,
    sourceId: action.sourceId,
    ...(action.targetId === undefined ? {} : { targetId: action.targetId }),
    result: row.result,
    timestamp: row.clientTimestamp.toISOString(),
    attemptIndex: row.attemptIndex,
  });
}

function toEventData(
  sessionId: string,
  event: GameInteraction,
): Prisma.InteractionEventCreateManyInput {
  return {
    eventId: event.eventId,
    sessionId,
    eventType: event.actionType,
    actionData:
      event.actionType === 'SELECT_CHOICE'
        ? { sourceId: event.sourceId }
        : { sourceId: event.sourceId, targetId: event.targetId },
    result: event.result,
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
    const now = new Date();
    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.playSession.updateMany({
          where: {
            sessionId: commit.sessionId,
            status: 'IN_PROGRESS',
            eventCount: commit.expectedEventCount,
          },
          data: {
            eventCount: commit.expectedEventCount + commit.accepted.length,
            lastEventAt: now,
            ...(commit.completed ? { status: 'COMPLETED', endedAt: now } : {}),
          },
        });
        if (updated.count === 0) return false;
        await tx.interactionEvent.createMany({
          data: commit.accepted.map((event) =>
            toEventData(commit.sessionId, event),
          ),
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
  async abandon(sessionId: string) {
    await this.prisma.playSession.updateMany({
      where: { sessionId, status: 'IN_PROGRESS' },
      data: { status: 'ABANDONED', endedAt: new Date() },
    });
  }
}
