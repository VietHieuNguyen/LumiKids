import { GameGenerationApiError, validateGameRequest } from "./api";
import { gameDifficultySchema } from "@lumikids/shared";
import type { GameDifficulty } from "@lumikids/shared";
import type {
  GeneratedGame,
  GenerateGameInput,
  GameGenerationGateway,
} from "./types";

export interface GameCreationDraft {
  game: GeneratedGame;
  source: GenerateGameInput;
  revision: number;
  difficulty: GameDifficulty | null;
}
export interface GameCreationSnapshot {
  status: "idle" | "generating" | "ready" | "error";
  draft: GameCreationDraft | null;
  error: GameGenerationApiError | null;
}
export function createGameCreationController(
  initialGateway: GameGenerationGateway,
) {
  let gateway = initialGateway;
  let snapshot: GameCreationSnapshot = {
    status: "idle",
    draft: null,
    error: null,
  };
  let version = 0;
  let revision = 0;
  let running: AbortController | null = null;
  const listeners = new Set<() => void>();
  const publish = (next: GameCreationSnapshot) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setGateway: (next: GameGenerationGateway) => {
      gateway = next;
    },
    setDifficulty: (difficulty: GameDifficulty) => {
      if (
        !snapshot.draft ||
        running ||
        !gameDifficultySchema.safeParse(difficulty).success
      )
        return;
      publish({ ...snapshot, draft: { ...snapshot.draft, difficulty } });
    },
    cancel: () => {
      version++;
      running?.abort();
      running = null;
      publish({
        ...snapshot,
        status: snapshot.draft ? "ready" : "idle",
        error: null,
      });
    },
    async generate(value: GenerateGameInput): Promise<boolean> {
      if (running) return false;
      let input: GenerateGameInput;
      try {
        input = validateGameRequest(value);
      } catch (error) {
        publish({
          ...snapshot,
          status: "error",
          error: error as GameGenerationApiError,
        });
        return false;
      }
      const current = ++version;
      const controller = new AbortController();
      running = controller;
      const requestGateway = gateway;
      publish({ ...snapshot, status: "generating", error: null });
      try {
        const game = await requestGateway.generate(input, controller.signal);
        if (current !== version || controller.signal.aborted) return false;
        revision++;
        publish({
          status: "ready",
          draft: { game, source: input, revision, difficulty: null },
          error: null,
        });
        return true;
      } catch (error) {
        if (current !== version || controller.signal.aborted) return false;
        publish({
          ...snapshot,
          status: "error",
          error:
            error instanceof GameGenerationApiError &&
            error.status === 401 &&
            requestGateway !== gateway
              ? new GameGenerationApiError(
                  "Phiên đăng nhập vừa được làm mới. Vui lòng thử lại yêu cầu.",
                  0,
                  "SESSION_UPDATED",
                )
              : error instanceof GameGenerationApiError
                ? error
                : new GameGenerationApiError(
                    "Chưa tạo được trò chơi. Vui lòng thử lại.",
                    0,
                    "GENERATION_FAILED",
                  ),
        });
        return false;
      } finally {
        if (current === version) running = null;
      }
    },
  };
}
