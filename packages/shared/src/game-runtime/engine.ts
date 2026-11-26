import { evaluateQuantity } from "./quantity.js";
import {
  GAME_INTERACTION_SCHEMA_VERSION,
  gameInteractionSchema,
} from "../game-content/interaction.schema.js";
import { getClassificationCorrectGroupIds } from "../game-content/classification.schema.js";
import type { GameContent } from "../game-content/game-content.schema.js";
import { evaluateCounting } from "./counting.js";
import { evaluateMatching } from "./matching.js";
import { evaluateClassification } from "./classification.js";
import { evaluatePattern } from "./pattern.js";
import { canRequestHint } from "./hint.js";
import type {
  ActionEvaluation,
  GameAction,
  GameProgress,
  GameState,
  GameTransition,
  InteractionIdentity,
} from "./types.js";

export function createInitialState(content: GameContent): GameState {
  const base = { attemptCount: 0, hintedItemIds: [], completed: false, lastInteraction: null };
  switch (content.gameType) {
    case "COUNTING":
      return { ...base, gameType: "COUNTING", selectedChoiceId: null };
    case "MATCHING":
      return { ...base, gameType: "MATCHING", matches: [] };
    case "CLASSIFICATION":
      return { ...base, gameType: "CLASSIFICATION", placements: [] };
    case "QUANTITY":
      return {...base,gameType:"QUANTITY",placements:[]};
    case "PATTERN":
      return { ...base, gameType: "PATTERN", solvedSequenceIds: [] };
  }
}

export function getGameProgress(
  content: GameContent,
  state: GameState,
): GameProgress {
  switch (content.gameType) {
    case "COUNTING":
      return {
        total: 1,
        correct:
          state.gameType === "COUNTING" &&
          state.selectedChoiceId === content.correctChoiceId
            ? 1
            : 0,
      };
    case "MATCHING":
      return {
        total: content.pairs.length,
        correct:
          state.gameType === "MATCHING"
            ? content.pairs.filter((pair) =>
                state.matches.some(
                  (placed) =>
                    pair.sourceId === placed.sourceId &&
                    pair.targetId === placed.targetId,
                ),
              ).length
            : 0,
      };
    case "CLASSIFICATION":
      return {
        total: content.items.length,
        correct:
          state.gameType === "CLASSIFICATION"
            ? content.items.filter((item) =>
                state.placements.some(
                  (placed) =>
                    item.id === placed.itemId &&
                    getClassificationCorrectGroupIds(item).includes(
                      placed.groupId,
                    ),
                ),
              ).length
            : 0,
      };
    case "QUANTITY":
      return { total:content.baskets.flatMap(b=>b.requirements).reduce((n,r)=>n+r.count,0),correct:state.gameType==="QUANTITY"?state.placements.length:0 };
    case "PATTERN":
      return {
        total: content.sequences.length,
        correct: state.gameType === "PATTERN" ? state.solvedSequenceIds.length : 0,
      };
  }
}

export function checkCompletion(
  content: GameContent,
  state: GameState,
): boolean {
  if (content.gameType !== state.gameType) return false;
  const progress = getGameProgress(content, state);
  switch (content.completionRule) {
    case "CORRECT_CHOICE":
    case "ALL_PAIRS_CORRECT":
    case "ALL_ITEMS_CLASSIFIED_CORRECTLY":
    case "ALL_BASKETS_FILLED":
    case "ALL_SEQUENCES_COMPLETED":
      return progress.correct === progress.total;
  }
}

/** Deterministic transition. Invalid/locked actions do not produce events or increase attempts. */
export function applyGameAction(
  content: GameContent,
  state: GameState,
  action: GameAction,
  identity: InteractionIdentity,
): GameTransition {
  const ignored = { state, interaction: null, completedNow: false };
  if (state.completed || state.gameType !== content.gameType) return ignored;
  if (action.actionType === "REQUEST_HINT") {
    // A hint is recorded like an answer (ordered, replayed by the server) but has no result.
    if (!canRequestHint(content, state, action.sourceId)) return ignored;
    const interaction = gameInteractionSchema.parse({
      schemaVersion: GAME_INTERACTION_SCHEMA_VERSION,
      ...identity,
      actionType: "REQUEST_HINT",
      sourceId: action.sourceId,
      attemptIndex: state.attemptCount + 1,
    });
    return {
      state: {
        ...state,
        hintedItemIds: [...state.hintedItemIds, action.sourceId],
        attemptCount: interaction.attemptIndex,
        lastInteraction: interaction,
      },
      interaction,
      completedNow: false,
    };
  }
  let evaluation: ActionEvaluation | null = null;
  switch (content.gameType) {
    case "COUNTING":
      if (state.gameType === "COUNTING")
        evaluation = evaluateCounting(content, state, action);
      break;
    case "MATCHING":
      if (state.gameType === "MATCHING")
        evaluation = evaluateMatching(content, state, action);
      break;
    case "CLASSIFICATION":
      if (state.gameType === "CLASSIFICATION")
        evaluation = evaluateClassification(content, state, action);
      break;
    case "QUANTITY":
      if(state.gameType==="QUANTITY") evaluation=evaluateQuantity(content,state,action);
      break;
    case "PATTERN":
      if (state.gameType === "PATTERN")
        evaluation = evaluatePattern(content, state, action);
      break;
  }
  if (!evaluation) return ignored;
  const interaction = gameInteractionSchema.parse({
    schemaVersion: GAME_INTERACTION_SCHEMA_VERSION,
    ...identity,
    ...action,
    result: evaluation.result,
    attemptIndex: state.attemptCount + 1,
  });
  const completed = checkCompletion(content, evaluation.state);
  return {
    state: {
      ...evaluation.state,
      attemptCount: interaction.attemptIndex,
      lastInteraction: interaction,
      completed,
    },
    interaction,
    completedNow: completed,
  };
}
