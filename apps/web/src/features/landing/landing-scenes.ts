import type { LandingScene } from "@lumikids/shared";
import { LANDING_ASSETS } from "./landing-assets";

/**
 * 3D scenes the landing page can show, keyed by the value stored in site settings.
 * A new scene (e.g. a snowy mountain) needs: its key in landingSceneSchema (shared), an entry here,
 * and the landing page loading its models; the admin settings page lists whatever is registered.
 */
export const LANDING_SCENES: Record<LandingScene, { label: string; description: string; poster: string }> = {
  VALLEY: {
    label: "Thung lũng",
    description: "Thung lũng xanh với cây cầu, hồ nước và các bạn thú.",
    poster: LANDING_ASSETS.poster,
  },
  ARCTIC: {
    label: "Bắc Cực",
    description: "Quả cầu Bắc Cực với bạn gấu, chim puffin và lửa trại.",
    poster: LANDING_ASSETS.arcticPoster,
  },
};
