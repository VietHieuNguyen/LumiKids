import { getClassificationCorrectGroupIds } from "../game-content/classification.schema.js";
import type { GameContent } from "../game-content/game-content.schema.js";
import type { GameState } from "./types.js";

/**
 * What a hint points at. COUNTING: the task is the question (named by its correct choice);
 * MATCHING: a pair (named by its source item); CLASSIFICATION: an item.
 * `targetIds` is what the runtime highlights: the correct choice, the matching target, the accepted groups.
 */
export interface HintTarget {
  taskId: string;
  targetIds: readonly string[];
}

function solvedTaskIds(content: GameContent, state: GameState): Set<string> {
  switch (content.gameType) {
    case "COUNTING":
      return new Set(
        state.gameType === "COUNTING" && state.selectedChoiceId === content.correctChoiceId
          ? [content.correctChoiceId]
          : [],
      );
    case "MATCHING":
      return new Set(state.gameType === "MATCHING" ? state.matches.map((pair) => pair.sourceId) : []);
    case "CLASSIFICATION":
      return new Set(state.gameType === "CLASSIFICATION" ? state.placements.map((placed) => placed.itemId) : []);
  }
}

/** Every task of the content with what its hint highlights, in content order. */
export function getHintTargets(content: GameContent): HintTarget[] {
  switch (content.gameType) {
    case "COUNTING":
      return [{ taskId: content.correctChoiceId, targetIds: [content.correctChoiceId] }];
    case "MATCHING":
      return content.pairs.map((pair) => ({ taskId: pair.sourceId, targetIds: [pair.targetId] }));
    case "CLASSIFICATION":
      return content.items.map((item) => ({ taskId: item.id, targetIds: getClassificationCorrectGroupIds(item) }));
  }
}

/** Whether a hint may be asked for this task now: unsolved, not hinted yet, game not finished. */
export function canRequestHint(content: GameContent, state: GameState, taskId: string): boolean {
  if (state.completed || state.gameType !== content.gameType) return false;
  if (state.hintedItemIds.includes(taskId)) return false;
  if (!getHintTargets(content).some((target) => target.taskId === taskId)) return false;
  return !solvedTaskIds(content, state).has(taskId);
}

/**
 * The task a hint button should help with: the preferred one (e.g. the item the child is holding)
 * when it can still get a hint, else the first unsolved task without a hint. Null when none is left.
 */
export function nextHintTarget(
  content: GameContent,
  state: GameState,
  preferredTaskId?: string | null,
): HintTarget | null {
  const targets = getHintTargets(content);
  const preferred = preferredTaskId ? targets.find((target) => target.taskId === preferredTaskId) : undefined;
  if (preferred && canRequestHint(content, state, preferred.taskId)) return preferred;
  return targets.find((target) => canRequestHint(content, state, target.taskId)) ?? null;
}
