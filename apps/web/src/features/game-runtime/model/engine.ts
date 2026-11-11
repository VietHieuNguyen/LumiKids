import {
  GAME_INTERACTION_SCHEMA_VERSION,
  gameInteractionSchema,
  getClassificationCorrectGroupIds,
} from "@lumikids/shared";
import type { GameContent } from "@lumikids/shared";
import { evaluateCounting } from "./counting.ts";
import { evaluateMatching } from "./matching.ts";
import { evaluateClassification } from "./classification.ts";
import type {
  ActionEvaluation,
  GameAction,
  GameProgress,
  GameState,
  GameTransition,
  InteractionIdentity,
} from "./types";

export function createInitialState(content: GameContent): GameState {
  const base = { attemptCount: 0, completed: false, lastInteraction: null };
  switch (content.gameType) {
    case "COUNTING":
      return { ...base, gameType: "COUNTING", selectedChoiceId: null };
    case "MATCHING":
      return { ...base, gameType: "MATCHING", matches: [] };
    case "CLASSIFICATION":
      return { ...base, gameType: "CLASSIFICATION", placements: [] };
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
