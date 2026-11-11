import { gameContentSchema } from "@lumikids/shared";
import type { GameContent, GameInteraction } from "@lumikids/shared";
import { applyGameAction, createInitialState } from "./engine.ts";
import type { GameAction, GameCompletion, GameState } from "./types";

function freezeSnapshot(state: GameState): GameState {
  if (state.lastInteraction) Object.freeze(state.lastInteraction);
  if (state.gameType === "MATCHING") {
    state.matches.forEach(Object.freeze);
    Object.freeze(state.matches);
  }
  if (state.gameType === "CLASSIFICATION") {
    state.placements.forEach(Object.freeze);
    Object.freeze(state.placements);
  }
  return Object.freeze(state);
}

export interface RuntimeCallbacks {
  onInteraction?: (event: GameInteraction) => void;
  onComplete?: (completion: GameCompletion) => void;
}
export interface RuntimeEnvironment {
  createEventId: () => string;
  now: () => string;
}

function createEventId(): string {
  if (typeof globalThis.crypto.randomUUID === "function")
    return globalThis.crypto.randomUUID();
  // getRandomValues also supports browsers where randomUUID needs HTTPS.
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Synchronous controller commits before callbacks; no React effects or updater side effects. */
export function createGameController(
  input: GameContent,
  callbacks: RuntimeCallbacks = {},
  environment: RuntimeEnvironment = {
    createEventId,
    now: () => new Date().toISOString(),
  },
) {
  const content = gameContentSchema.parse(input);
  let state = freezeSnapshot(createInitialState(content));
  let run = 0;
  return {
    getState: () => state,
    setCallbacks(next: RuntimeCallbacks) {
      callbacks = next;
    },
    reset() {
      run++;
      state = freezeSnapshot(createInitialState(content));
      return state;
    },
    dispatch(action: GameAction) {
      if (state.completed) return state;
      const transition = applyGameAction(content, state, action, {
        eventId: environment.createEventId(),
        timestamp: environment.now(),
      });
      state = freezeSnapshot(transition.state);
      if (transition.interaction) {
        const currentRun = run;
        try {
          callbacks.onInteraction?.(transition.interaction);
        } finally {
          if (transition.completedNow && run === currentRun)
            callbacks.onComplete?.({
              gameType: content.gameType,
              attemptCount: state.attemptCount,
              completed: true,
            });
        }
      }
      return state;
    },
  };
}
