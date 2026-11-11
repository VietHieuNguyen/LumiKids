import type { CountingContent } from "@lumikids/shared";
import type { CountingState, GameAction, ActionEvaluation } from "./types";

export function evaluateCounting(
  content: CountingContent,
  state: CountingState,
  action: GameAction,
): ActionEvaluation | null {
  if (
    action.actionType !== "SELECT_CHOICE" ||
    !content.choices.some((choice) => choice.id === action.sourceId)
  )
    return null;
  return {
    state: { ...state, selectedChoiceId: action.sourceId },
    result:
      action.sourceId === content.correctChoiceId ? "CORRECT" : "INCORRECT",
  };
}
