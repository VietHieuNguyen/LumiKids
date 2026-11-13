import type { ClassificationContent } from "../game-content/classification.schema.js";
import { getClassificationCorrectGroupIds } from "../game-content/classification.schema.js";
import type {
  ClassificationState,
  GameAction,
  ActionEvaluation,
} from "./types.js";

export function evaluateClassification(
  content: ClassificationContent,
  state: ClassificationState,
  action: GameAction,
): ActionEvaluation | null {
  if (
    action.actionType !== "CLASSIFY_DROP" ||
    !content.groups.some((group) => group.id === action.targetId)
  )
    return null;
  const item = content.items.find(
    (candidate) => candidate.id === action.sourceId,
  );
  if (
    !item ||
    state.placements.some((placement) => placement.itemId === item.id)
  )
    return null;
  const correct = getClassificationCorrectGroupIds(item).includes(
    action.targetId,
  );
  return {
    result: correct ? "CORRECT" : "INCORRECT",
    state: {
      ...state,
      placements: correct
        ? [...state.placements, { itemId: item.id, groupId: action.targetId }]
        : state.placements,
    },
  };
}
