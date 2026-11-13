import type { GameInteraction, PlaySessionStatus } from '@lumikids/shared';

export interface PlaySessionRecord {
  sessionId: string;
  versionId: string;
  ownerUserId: string;
  status: PlaySessionStatus;
  eventCount: number;
  startedAt: Date;
  endedAt: Date | null;
}
export interface StartSessionData {
  childId: string;
  versionId: string;
  startRequestId: string;
}
export interface AppendCommit {
  sessionId: string;
  expectedEventCount: number;
  accepted: readonly GameInteraction[];
  completed: boolean;
}

/** Port implemented by infrastructure; application code never touches Prisma. */
export abstract class PlaySessionRepository {
  abstract findById(sessionId: string): Promise<PlaySessionRecord | null>;
  abstract findByStartRequest(
    childId: string,
    startRequestId: string,
  ): Promise<PlaySessionRecord | null>;
  /** Creates the session and abandons the child's other IN_PROGRESS sessions atomically. */
  abstract start(data: StartSessionData): Promise<PlaySessionRecord>;
  abstract listInteractions(sessionId: string): Promise<GameInteraction[]>;
  /** Event IDs from the batch that already belong to a different session. */
  abstract findForeignEventIds(
    sessionId: string,
    eventIds: readonly string[],
  ): Promise<string[]>;
  /** False when another request changed the session first (optimistic concurrency). */
  abstract commitAppend(commit: AppendCommit): Promise<boolean>;
  abstract abandon(sessionId: string): Promise<void>;
}
