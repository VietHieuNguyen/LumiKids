import type {
  CountingInteraction,
  MatchingInteraction,
  ClassificationInteraction,
  GameInteraction,
  GameType,
  MatchingPair,
} from "@lumikids/shared";

export type GameAction =
  | Pick<CountingInteraction, "actionType" | "sourceId">
  | Pick<MatchingInteraction, "actionType" | "sourceId" | "targetId">
  | Pick<ClassificationInteraction, "actionType" | "sourceId" | "targetId">;

interface BaseState {
  attemptCount: number;
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
