import type {
  GameInteraction,
  PlaySessionStatus,
  SessionPerformance,
} from '@lumikids/shared';
import type { CriterionEvaluationDraft } from '../domain/criterion-evaluation.js';
import type { FinishedPlay } from '../domain/child-corner.js';

export interface PlaySessionRecord {
  sessionId: string;
  versionId: string;
  childId: string;
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
  /** Present only when this batch completes the session; written in the same transaction. */
  completion: SessionCompletion | null;
}
export interface SessionCompletion {
  completedAt: Date;
  performance: SessionPerformance;
  evaluation: CriterionEvaluationDraft | null;
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
  /**
   * The criterion a version is assessed for. A version has exactly one; versions saved before
   * that rule may have several, and the first by code is used.
   */
  abstract primaryCriterionCode(versionId: string): Promise<string | null>;
  /** The child's completed plays, newest first (bounded). */
  abstract finishedPlays(childId: string, limit: number): Promise<FinishedPlay[]>;
  /** The class the child is in now and its teachers, or null. */
  abstract currentClassroom(
    childId: string,
  ): Promise<{ className: string; teacherNames: string[] } | null>;
}
