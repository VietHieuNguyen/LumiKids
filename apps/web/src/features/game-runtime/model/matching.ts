import type { MatchingContent } from "@lumikids/shared";
import type { MatchingState, GameAction, ActionEvaluation } from "./types";

export function evaluateMatching(
  content: MatchingContent,
  state: MatchingState,
  action: GameAction,
): ActionEvaluation | null {
  if (
    action.actionType !== "MATCH_DROP" ||
    !content.sourceItems.some((item) => item.id === action.sourceId) ||
    !content.targetItems.some((item) => item.id === action.targetId)
  )
    return null;
  if (
    state.matches.some(
      (pair) =>
        pair.sourceId === action.sourceId || pair.targetId === action.targetId,
    )
  )
    return null;
  const correct = content.pairs.some(
    (pair) =>
      pair.sourceId === action.sourceId && pair.targetId === action.targetId,
  );
  return {
    result: correct ? "CORRECT" : "INCORRECT",
    state: {
      ...state,
      matches: correct
        ? [
            ...state.matches,
            { sourceId: action.sourceId, targetId: action.targetId },
          ]
        : state.matches,
    },
  };
}
