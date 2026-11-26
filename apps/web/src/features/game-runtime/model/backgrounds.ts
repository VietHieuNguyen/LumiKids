import type { GameType } from "@lumikids/shared";

export type SceneTheme = "forest" | "pond" | "savanna" | "ocean";
export const SCENE_BACKGROUNDS: Record<SceneTheme, string> = {
  ocean: "/game-scenes/ocean/background.svg",
  forest: "/game-scenes/forest/background.png",
  pond: "/game-scenes/pond/background_pond.png",
  savanna: "/game-scenes/savana/savanna_background.png",
};

/** Visual theme depends only on game type, never on items, answers or shuffle order. */
export function gameSceneTheme(gameType: GameType): SceneTheme {
  if (gameType === "COUNTING") return "pond";
  if (gameType === "CLASSIFICATION") return "savanna";
  return "forest";
}
