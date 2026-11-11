import type { GameContent, GameType } from "@lumikids/shared";

export const MAX_GAME_PROMPT_LENGTH = 2000;
export interface GenerateGameInput {
  gameType: GameType;
  prompt: string;
}
export interface GeneratedPreviewAccess {
  token: string;
  expiresAt: string;
}
export interface GeneratedGame {
  gameType: GameType;
  gameContent: GameContent;
  generation: {
    requestId: string;
    model: string;
    attempts: number;
    reviewRequired: true;
    warnings: string[];
    validatedAt: string;
    preview: GeneratedPreviewAccess;
  };
}
export interface GameGenerationGateway {
  generate(
    input: GenerateGameInput,
    signal?: AbortSignal,
  ): Promise<GeneratedGame>;
}
export function canCreateGames(
  user: { permissions: readonly string[] } | null | undefined,
): boolean {
  return user?.permissions.includes("GENERATE_GAME_CONTENT") ?? false;
}
