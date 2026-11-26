import { comparisonRelation } from "../game-content/comparison-change.schema.js";
import type { ComparisonChangeContent } from "../game-content/comparison-change.schema.js";
import type {
  ComparisonChangeState,
  GameAction,
  ActionEvaluation,
} from "./types.js";

export function currentComparisonQuestion(
  content: ComparisonChangeContent,
  state: ComparisonChangeState,
) {
  return (
    content.questions.find((q) => !state.solvedQuestionIds.includes(q.id)) ??
    null
  );
}
/** Only submitted answers enter the engine. Editing the board is local, unscored UI state. */
export function evaluateComparisonChange(
  content: ComparisonChangeContent,
  state: ComparisonChangeState,
  action: GameAction,
): ActionEvaluation | null {
  const q = currentComparisonQuestion(content, state);
  if (!q || action.sourceId !== q.id) return null;
  let correct: boolean;
  if (q.mode === "COMPARE") {
    if (
      action.actionType !== "COMPARE_QUANTITIES" ||
      !["GT", "LT", "EQ"].includes(action.targetId)
    )
      return null;
    correct =
      action.targetId === comparisonRelation(q.initialCount, q.targetCount);
  } else {
    if (
      action.actionType !== "CONFIRM_QUANTITY_CHANGE" ||
      !Number.isInteger(action.count) ||
      action.count < 0 ||
      action.count > 10
    )
      return null;
    if (
      (q.mode === "ADD" && action.count < q.initialCount) ||
      (q.mode === "REMOVE" && action.count > q.initialCount)
    )
      return null;
    correct = action.count === q.targetCount;
  }
  return {
    state: correct
      ? { ...state, solvedQuestionIds: [...state.solvedQuestionIds, q.id] }
      : state,
    result: correct ? "CORRECT" : "INCORRECT",
  };
}
