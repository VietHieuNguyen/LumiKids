/**
 * Single source of truth for the African Savanna layout (classification games and /savanna-demo).
 *
 * Coordinates are expressed the way the scene is seen, so the layout survives every viewport:
 * - `x`: horizontal screen fraction of the stage (0 = left edge, 1 = right edge).
 * - `foot`: vertical screen fraction where the model's base touches the painted ground. It must be
 *   below the background horizon; the stage casts a ray to the ground plane, so perspective size,
 *   ground contact and contact shadows all follow from one camera.
 * - `height`: world height relative to the camera eye height (1 = eye level). Far objects (foot close
 *   to the horizon) automatically appear smaller.
 * - `yaw`: radians around the vertical axis; 0 faces the camera, positive turns toward screen right.
 * Every savanna GLB is authored Z-up with its face towards -Y; the loader converts that once.
 */

export const SAVANNA_MODEL_ROOT = "/models/savana";

export const SAVANNA_BACKGROUND = {
  src: "/game-scenes/savana/savanna_background.png",
  width: 1672,
  height: 941,
  /** Image-space row where the golden plain meets the far hills (the perspective horizon). */
  horizon: 0.47,
} as const;

export type SavannaMotion = "tree" | "grass" | "animal" | "still";

/** A rigid sub-part (no skeleton exists) moved around a pivot given in source Z-up coordinates. */
export interface SavannaRigPart {
  meshes: readonly string[];
  pivot: readonly [number, number, number];
}
export interface SavannaRig {
  head?: SavannaRigPart;
  tail?: SavannaRigPart;
}

export interface SavannaPlacementOverride {
  x?: number;
  foot?: number;
  height?: number;
  visible?: boolean;
}

export interface SavannaPlacement {
  id: string;
  /** Path relative to SAVANNA_MODEL_ROOT, without the extension. */
  model: string;
  x: number;
  foot: number;
  height: number;
  yaw?: number;
  visible?: boolean;
  motion?: SavannaMotion;
  /** Upper bound for the projected width, as a fraction of the stage width. */
  maxWidth?: number;
  castShadow?: boolean;
  /** Portrait/narrow stages (aspect below `camera.compactAspect`). */
  compact?: SavannaPlacementOverride;
  rig?: SavannaRig;
}

export interface SavannaCloud {
  id: string;
  model: string;
  /** Initial horizontal screen fraction; clouds wrap outside the viewport. */
  x: number;
  /** Vertical screen fraction of the cloud centre (sky band only). */
  y: number;
  /** Cloud width as a fraction of the stage width. */
  width: number;
  /** Seconds for one full crossing. Different periods keep the clouds from moving in lockstep. */
  period: number;
  visible?: boolean;
}

export interface SavannaSceneConfig {
  camera: {
    /** Vertical field of view in degrees. */
    fov: number;
    /** Stages narrower than this use `compact` overrides. */
    compactAspect: number;
    /** Objects shrink smoothly below this aspect so tablets/phones do not get crowded. */
    referenceAspect: number;
    minSizeScale: number;
  };
  lighting: {
    sky: string;
    ground: string;
    hemisphere: number;
    sun: string;
    sunIntensity: number;
    /** Direction towards the sun, roughly upper-left and in front, like the painted light. */
    sunDirection: readonly [number, number, number];
    shadowColor: string;
    shadowOpacity: number;
    environment: number;
    /** Soft self-light for clouds seen from below, so they read white instead of grey. */
    cloudGlow: number;
  };
  /** Warm aerial haze so distant trees settle into the painted hills. */
  haze: { color: string; near: number; far: number };
  environment: readonly SavannaPlacement[];
  animals: readonly SavannaPlacement[];
  clouds: readonly SavannaCloud[];
}

const meshRange = (prefix: string, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `${prefix}_${String(from + i).padStart(3, "0")}`);

export const savannaSceneConfig: SavannaSceneConfig = {
  camera: { fov: 30, compactAspect: 1, referenceAspect: 1.45, minSizeScale: 0.62 },
  lighting: {
    sky: "#e3f3ff",
    ground: "#efcf7c",
    hemisphere: 1.55,
    sun: "#fff0d2",
    sunIntensity: 2.1,
    sunDirection: [-0.4, 1.7, 0.55],
    shadowColor: "#7d5f22",
    shadowOpacity: 0.2,
    environment: 0.3,
    cloudGlow: 0.42,
  },
  haze: { color: "#f3ddb0", near: 14, far: 70 },
  // Framing: big shapes at the edges, the centre stays open for the game and the two animals.
  environment: [
    // Left: large acacia wrapping the scene, bush, rocks and dry grass.
    { id: "acacia-left", model: "trees/acacia_large", x: 0.075, foot: 0.79, height: 1.45, yaw: 0.25, motion: "tree", maxWidth: 0.42, compact: { x: -0.02, foot: 0.74 } },
    { id: "bush-left", model: "bushes/savanna_bush", x: 0.17, foot: 0.86, height: 0.2, yaw: 0.4, motion: "grass", compact: { x: 0.05, foot: 0.9 } },
    { id: "rocks-left", model: "rocks/rock_cluster_large", x: 0.075, foot: 0.93, height: 0.17, yaw: 0.3, compact: { x: 0.08, foot: 0.97 } },
    { id: "grass-left-a", model: "grass/dry_grass_large", x: 0.025, foot: 0.97, height: 0.2, motion: "grass", castShadow: false, compact: { visible: false } },
    { id: "grass-left-b", model: "grass/dry_grass_small", x: 0.2, foot: 0.965, height: 0.13, yaw: 0.6, motion: "grass", castShadow: false, compact: { x: 0.26, foot: 0.985 } },
    { id: "log-left", model: "details/fallen_log", x: 0.255, foot: 0.985, height: 0.08, yaw: 0.35, visible: false },
    // Right: baobab, termite mound, bush, small rocks and grass.
    { id: "baobab-right", model: "trees/baobab", x: 0.93, foot: 0.775, height: 1.25, yaw: -0.3, motion: "tree", maxWidth: 0.3, compact: { x: 1.02, foot: 0.73 } },
    { id: "termite-right", model: "details/termite_mound", x: 0.81, foot: 0.79, height: 0.32, yaw: -0.2, compact: { visible: false } },
    { id: "bush-right", model: "bushes/savanna_bush", x: 0.875, foot: 0.895, height: 0.19, yaw: -0.5, motion: "grass", compact: { x: 0.93, foot: 0.92 } },
    { id: "rocks-right", model: "rocks/rock_cluster_small", x: 0.795, foot: 0.965, height: 0.1, yaw: -0.4, compact: { x: 0.78, foot: 0.985 } },
    { id: "grass-right-a", model: "grass/dry_grass_large", x: 0.975, foot: 0.965, height: 0.19, yaw: 0.8, motion: "grass", castShadow: false, compact: { visible: false } },
    { id: "grass-right-b", model: "grass/green_grass", x: 0.735, foot: 0.985, height: 0.1, motion: "grass", castShadow: false, compact: { visible: false } },
    // Waterhole in front of the lion: a quiet focal point that keeps the lawn between the animals open.
    { id: "waterhole", model: "details/small_waterhole", x: 0.585, foot: 0.885, height: 0.06, maxWidth: 0.16, castShadow: false, compact: { visible: false } },
    // Far plain: small, hazy silhouettes near the horizon give depth.
    { id: "acacia-far", model: "trees/acacia_small", x: 0.655, foot: 0.545, height: 1.15, yaw: -0.4, motion: "tree", compact: { x: 0.72, foot: 0.53 } },
    { id: "bare-far", model: "trees/bare_tree", x: 0.315, foot: 0.535, height: 0.95, yaw: 0.6, compact: { visible: false } },
    { id: "grass-far", model: "grass/dry_grass_small", x: 0.43, foot: 0.585, height: 0.26, motion: "grass", castShadow: false, compact: { visible: false } },
  ],
  animals: [
    {
      id: "giraffe", model: "animals/giraffe", x: 0.255, foot: 0.925, height: 0.86, yaw: 0.42, motion: "animal", maxWidth: 0.2,
      compact: { x: 0.24, foot: 0.95 },
      rig: {
        // Neck, head, ears, ossicones, face details and neck spots.
        head: { meshes: [...meshRange("giraffe", 10, 38), ...meshRange("giraffe", 47, 50)], pivot: [-0.16, -0.15, 1.55] },
        tail: { meshes: meshRange("giraffe", 55, 58), pivot: [0.62, 0.66, 1.42] },
      },
    },
    {
      id: "lion", model: "animals/lion", x: 0.715, foot: 0.93, height: 0.4, yaw: -0.45, motion: "animal", maxWidth: 0.2,
      compact: { x: 0.74, foot: 0.955 },
      rig: {
        // Mane, face, ears, eyes, muzzle and whiskers.
        head: { meshes: meshRange("lion", 16, 64), pivot: [0, -0.35, 1.05] },
        tail: { meshes: meshRange("lion", 65, 68), pivot: [0.62, 0.6, 1.1] },
      },
    },
  ],
  clouds: [
    { id: "cloud-a", model: "sky/soft_cloud", x: 0.18, y: 0.15, width: 0.1, period: 150 },
    { id: "cloud-b", model: "sky/soft_cloud", x: 0.58, y: 0.1, width: 0.075, period: 185 },
    { id: "cloud-c", model: "sky/soft_cloud", x: 0.86, y: 0.22, width: 0.06, period: 220 },
  ],
};

/** Every GLB URL the scene can request; used by the stage and by asset tests. */
export function savannaModelUrl(model: string): string {
  return `${SAVANNA_MODEL_ROOT}/${model}.glb`;
}
