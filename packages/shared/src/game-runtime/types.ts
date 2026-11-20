import type { GameType } from "../game-content/common.js";
import type { MatchingPair } from "../game-content/matching.schema.js";
import type {
  CountingInteraction,
  MatchingInteraction,
  ClassificationInteraction,
  GameInteraction,
  HintInteraction,
} from "../game-content/interaction.schema.js";

export type GameAction =
  | Pick<CountingInteraction, "actionType" | "sourceId">
  | Pick<MatchingInteraction, "actionType" | "sourceId" | "targetId">
  | Pick<ClassificationInteraction, "actionType" | "sourceId" | "targetId">
  | Pick<HintInteraction, "actionType" | "sourceId">;

interface BaseState {
  /** Number of events applied (answers and hint requests). */
  attemptCount: number;
  /** Tasks the child already got a hint for (one hint per task). */
  hintedItemIds: readonly string[];
  completed: boolean;
  lastInteraction: GameInteraction | null;
}
export interface CountingState extends BaseState {
  gameType: "COUNTING";
  selectedChoiceId: string | null;
}
export interface MatchingState extends BaseState {
  gameType: "MATCHING";
  matches: readonly MatchingPair[];
}
export interface ClassificationState extends BaseState {
  gameType: "CLASSIFICATION";
  placements: readonly { itemId: string; groupId: string }[];
}
export type GameState = CountingState | MatchingState | ClassificationState;
export interface GameProgress {
  correct: number;
  total: number;
}
export interface GameCompletion {
  gameType: GameType;
  attemptCount: number;
  completed: true;
}
export interface ActionEvaluation {
  state: GameState;
  result: "CORRECT" | "INCORRECT";
}
export interface GameTransition {
  state: GameState;
  interaction: GameInteraction | null;
  completedNow: boolean;
}
export interface InteractionIdentity {
  eventId: string;
  timestamp: string;
}
