import type { QuantityContent } from "../game-content/quantity.schema.js";
import type { GameAction, QuantityState, ActionEvaluation } from "./types.js";

export function evaluateQuantity(
  content: QuantityContent,
  state: QuantityState,
  action: GameAction,
): ActionEvaluation | null {
  if (action.actionType !== "QUANTITY_DROP") return null;
  const item = content.items.find((i) => i.id === action.sourceId);
  const basket = content.baskets.find((b) => b.id === action.targetId);
  if (!item || !basket || state.placements.some((p) => p.itemId === item.id))
    return null;
  const limit =
    basket.requirements.find((r) => r.assetId === item.assetId)?.count ?? 0;
  const placed = state.placements.filter(
    (p) =>
      p.basketId === basket.id &&
      content.items.find((i) => i.id === p.itemId)?.assetId === item.assetId,
  ).length;
  const correct = placed < limit;
  return {
    state: correct
      ? {
          ...state,
          placements: [
            ...state.placements,
            { itemId: item.id, basketId: basket.id },
          ],
        }
      : state,
    result: correct ? "CORRECT" : "INCORRECT",
  };
}
