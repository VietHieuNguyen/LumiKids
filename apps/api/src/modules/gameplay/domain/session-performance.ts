import { getHintTargets } from '@lumikids/shared';
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
 * CLASSIFICATION = one item per object to place; PATTERN = one item per sequence.
 */
export function scoredItemIds(content: GameContent): string[] {
  switch (content.gameType) {
    case 'COUNTING':
      return [COUNTING_ITEM_ID];
    case 'MATCHING':
      return content.pairs.map((pair) => pair.sourceId);
    case 'CLASSIFICATION':
      return content.items.map((item) => item.id);
    case 'QUANTITY':
      return content.baskets.flatMap((b) =>
        b.requirements.flatMap((r) =>
          Array.from(
            { length: r.count },
            (_, index) => `${b.id}:${r.assetId}:${index + 1}`,
          ),
        ),
      );
    case 'PATTERN':
      return content.sequences.map((sequence) => sequence.id);
  }
}

/** A hint names its task the same way an answer names its item (see getHintTargets). */
function itemOf(content: GameContent, event: GameInteraction): string {
  if (content.gameType === 'QUANTITY' && event.actionType === 'QUANTITY_DROP')
    return `${event.targetId}:${content.items.find((i) => i.id === event.sourceId)?.assetId}`;
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

type Step = 'CORRECT' | 'INCORRECT' | 'HINT';

/**
 * Builds SessionPerformance. Each item is classified once by what happened before its first
 * correct answer: a hint → H; otherwise correct on the first attempt → F; wrong first → R.
 * Never correct → unfinished (the current engines never lock a wrong answer).
 * attemptCount counts answers only; hints are counted separately.
 */
export function computeSessionPerformance(
  input: PerformanceInput,
): SessionPerformance {
  const items = scoredItemIds(input.content);
  const known = new Set(items);
  const steps = new Map<string, Step[]>(items.map((id) => [id, []]));
  const ordered = [...input.events].sort(
    (a, b) => a.attemptIndex - b.attemptIndex,
  );
  const hintTasks = new Set(getHintTargets(input.content).map((t) => t.taskId));
  const quantities = new Map<string, number>();
  for (const event of ordered) {
    if (event.actionType === 'REQUEST_HINT' && !hintTasks.has(event.sourceId))
      continue;
    let itemId = itemOf(input.content, event);
    if (
      input.content.gameType === 'QUANTITY' &&
      event.actionType === 'QUANTITY_DROP'
    ) {
      const key = itemId;
      const assetId = input.content.items.find(
        (i) => i.id === event.sourceId,
      )?.assetId;
      const required =
        input.content.baskets
          .find((b) => b.id === event.targetId)
          ?.requirements.find((r) => r.assetId === assetId)?.count ?? 0;
      const placed = quantities.get(key) ?? 0;
      itemId = `${key}:${Math.min(placed + 1, required)}`;
      if (event.result === 'CORRECT') quantities.set(key, placed + 1);
    }
    if (!known.has(itemId)) continue;
    steps.get(itemId)?.push('result' in event ? event.result : 'HINT');
  }

  let firstAttemptCorrectCount = 0;
  let retryCorrectCount = 0;
  let hintCorrectCount = 0;
  let hintCount = 0;
  let attemptCount = 0;
  for (const list of steps.values()) {
    const answers = list.filter((step) => step !== 'HINT');
    attemptCount += answers.length;
    hintCount += list.length - answers.length;
    const firstCorrect = list.indexOf('CORRECT');
    if (firstCorrect < 0) continue;
    const before = list.slice(0, firstCorrect);
    if (before.includes('HINT')) hintCorrectCount++;
    else if (before.length === 0) firstAttemptCorrectCount++;
    else retryCorrectCount++;
  }
  const finalized =
    firstAttemptCorrectCount + retryCorrectCount + hintCorrectCount;
  const criterionPerformance: CriterionPerformance = {
    totalScoredItems: items.length,
    finalizedScoredItems: finalized,
    firstAttemptCorrectCount,
    retryCorrectCount,
    hintCorrectCount,
    hintCount,
    attemptCount,
  };
  return {
    totalItemCount: items.length,
    finalizedItemCount: finalized,
    attemptCount,
    completionDurationSeconds: input.endedAt
      ? Math.max(
          0,
          (input.endedAt.getTime() - input.startedAt.getTime()) / 1000,
        )
      : null,
    criterionCode: input.criterionCode,
    criterionPerformance,
  };
}
