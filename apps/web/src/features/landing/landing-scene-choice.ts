import { landingSceneSchema } from "@lumikids/shared";
import type { LandingScene } from "@lumikids/shared";

/** How long the landing waits for the admin's scene before going on with what it has. */
export const SETTINGS_DEADLINE_MS = 1500;
/** Per-browser memory of the last scene, so a returning visitor starts loading at once. */
export const SCENE_MEMORY_KEY = "lumikids.landingScene";

/**
 * The scene the landing commits to, or null while it still has to wait. Once chosen it never
 * changes for this page view, so two stages are never built; a new admin choice shows next visit.
 */
export function chooseLandingScene(input: {
  locked: LandingScene | null;
  ready: boolean;
  fromSettings: LandingScene;
  remembered: string | null;
}): LandingScene | null {
  if (input.locked) return input.locked;
  const remembered = landingSceneSchema.safeParse(input.remembered);
  if (remembered.success) return remembered.data;
  return input.ready ? input.fromSettings : null;
}
