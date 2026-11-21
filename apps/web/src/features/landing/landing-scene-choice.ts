import { landingSceneSchema } from "@lumikids/shared";
import type { LandingScene } from "@lumikids/shared";

/** How long the landing waits for the admin's scene before going on with what it has. */
export const SETTINGS_DEADLINE_MS = 1500;
/** Per-browser memory of the last scene, so a returning visitor starts loading at once. */
export const SCENE_MEMORY_KEY = "lumikids.landingScene";

/**
 * The scene the landing commits to, or null while it still waits for the settings. The admin's saved
 * scene always wins, so an applied change shows on the next page load; the scene remembered in this
 * browser only covers an API that failed or missed the deadline. Once chosen it never changes for this
 * page view, so two stages are never built.
 */
export function chooseLandingScene(input: {
  locked: LandingScene | null;
  ready: boolean;
  fromApi: boolean;
  fromSettings: LandingScene;
  remembered: string | null;
}): LandingScene | null {
  if (input.locked) return input.locked;
  if (!input.ready) return null;
  if (input.fromApi) return input.fromSettings;
  const remembered = landingSceneSchema.safeParse(input.remembered);
  return remembered.success ? remembered.data : input.fromSettings;
}
