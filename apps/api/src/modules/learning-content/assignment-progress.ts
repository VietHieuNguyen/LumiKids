import type { CompletionStatus } from '@lumikids/shared';
import type { SessionFact } from './assignments.repository.js';

export interface RecipientProgress {
  completedVersionIds: string[];
  completionStatus: CompletionStatus;
}

/**
 * Completion requires a completed play of every assigned version. For historical sessions without
 * an assignment link, retain the version and opening-time rule.
 */
export function recipientProgress(
  versionIds: readonly string[],
  opensAt: Date,
  sessions: readonly SessionFact[],
  assignmentId: string,
): RecipientProgress {
  const relevant = sessions.filter(
    (session) =>
      versionIds.includes(session.versionId) &&
      (session.assignmentId === null
        ? session.startedAt >= opensAt
        : session.assignmentId === assignmentId),
  );
  const done = new Set(
    relevant
      .filter((session) => session.status === 'COMPLETED')
      .map((session) => session.versionId),
  );
  const completedVersionIds = versionIds.filter((id) => done.has(id));
  const completionStatus: CompletionStatus =
    versionIds.length > 0 && completedVersionIds.length === versionIds.length
      ? 'COMPLETED'
      : relevant.length > 0
        ? 'IN_PROGRESS'
        : 'NOT_STARTED';
  return { completedVersionIds, completionStatus };
}

/** Groups session facts by child for repeated lookups. */
export function sessionsByChild(
  sessions: readonly SessionFact[],
): Map<string, SessionFact[]> {
  const map = new Map<string, SessionFact[]>();
  for (const session of sessions) {
    const list = map.get(session.childId);
    if (list) list.push(session);
    else map.set(session.childId, [session]);
  }
  return map;
}
