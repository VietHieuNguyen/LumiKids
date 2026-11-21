import {
  PATTERN_RULE_UNITS,
  type PatternContent,
  type PatternSequence,
} from "../game-content/pattern.schema.js";
import type { ActionEvaluation, GameAction, PatternState } from "./types.js";

/** Sequences are solved in order; the child only ever works on the first unsolved one. */
export function currentPatternSequence(
  content: PatternContent,
  state: PatternState,
): PatternSequence | null {
  return content.sequences.find((sequence) => !state.solvedSequenceIds.includes(sequence.id)) ?? null;
}

/** Ids the renderer lights up for a hint: the cells of the first period of the rule. */
export function patternHintCellIds(sequence: PatternSequence): string[] {
  return PATTERN_RULE_UNITS[sequence.rule].map((_, index) => `${sequence.id}:cell:${index}`);
}

export function evaluatePattern(
  content: PatternContent,
  state: PatternState,
  action: GameAction,
): ActionEvaluation | null {
  if (action.actionType !== "FILL_PATTERN") return null;
  const current = currentPatternSequence(content, state);
  if (!current || action.sourceId !== current.id || !current.choiceIds.includes(action.targetId))
    return null;
  const correct = action.targetId === current.correctItemId;
  return {
    state: correct ? { ...state, solvedSequenceIds: [...state.solvedSequenceIds, current.id] } : state,
    result: correct ? "CORRECT" : "INCORRECT",
  };
}
