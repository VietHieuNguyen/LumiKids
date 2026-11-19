import type {
  CriterionPerformance,
  GameContent,
  GameInteraction,
  SessionPerformance,
} from '@lumikids/shared';

/** The only item of a COUNTING game: the whole question. */
const COUNTING_ITEM_ID = 'counting-question';

/**
 * Items (nhiệm vụ) of a version, from the content — never from the events.
 * COUNTING = one question; MATCHING = one item per pair (keyed by its source);
 * CLASSIFICATION = one item per object to place.
 */
export function scoredItemIds(content: GameContent): string[] {
  switch (content.gameType) {
    case 'COUNTING':
      return [COUNTING_ITEM_ID];
    case 'MATCHING':
      return content.pairs.map((pair) => pair.sourceId);
    case 'CLASSIFICATION':
      return content.items.map((item) => item.id);
  }
}

function itemOf(content: GameContent, event: GameInteraction): string {
  return content.gameType === 'COUNTING' ? COUNTING_ITEM_ID : event.sourceId;
}

export interface PerformanceInput {
  content: GameContent;
  /** Server-verified events (results recomputed by the shared engine), in attempt order. */
  events: readonly GameInteraction[];
  /** The single criterion of the version; null when the version has none. */
  criterionCode: string | null;
  startedAt: Date;
  endedAt: Date | null;
}

/**
 * Builds SessionPerformance. Each item is classified once: correct on its first attempt → F;
 * wrong first and correct later → R; never correct → finalized only if the engine locked it
 * (the current engines never lock a wrong answer, so such items stay unfinished).
 */
export function computeSessionPerformance(
  input: PerformanceInput,
): SessionPerformance {
  const items = scoredItemIds(input.content);
  const known = new Set(items);
  const attempts = new Map<string, ('CORRECT' | 'INCORRECT')[]>(
    items.map((id) => [id, []]),
  );
  const ordered = [...input.events].sort(
    (a, b) => a.attemptIndex - b.attemptIndex,
  );
  for (const event of ordered) {
    const itemId = itemOf(input.content, event);
    // A wrong MATCH_DROP/CLASSIFY_DROP always names an existing source; anything else is ignored.
    if (!known.has(itemId)) continue;
    attempts.get(itemId)?.push(event.result);
  }

  let firstAttemptCorrectCount = 0;
  let retryCorrectCount = 0;
  let attemptCount = 0;
  for (const results of attempts.values()) {
    attemptCount += results.length;
    const firstCorrect = results.indexOf('CORRECT');
    if (firstCorrect === 0) firstAttemptCorrectCount++;
    else if (firstCorrect > 0) retryCorrectCount++;
  }
  const finalized = firstAttemptCorrectCount + retryCorrectCount;
  const criterionPerformance: CriterionPerformance = {
    totalScoredItems: items.length,
    finalizedScoredItems: finalized,
    firstAttemptCorrectCount,
    retryCorrectCount,
    attemptCount,
  };
  return {
    totalItemCount: items.length,
    finalizedItemCount: finalized,
    attemptCount: ordered.length,
    completionDurationSeconds: input.endedAt
      ? Math.max(0, (input.endedAt.getTime() - input.startedAt.getTime()) / 1000)
      : null,
    criterionCode: input.criterionCode,
    criterionPerformance,
  };
}
