import { createMonotoneCurve } from "./scroll-math";

export type Vec3 = readonly [number, number, number];

export type CameraShot = {
  readonly name: string;
  readonly position: Vec3;
  readonly target: Vec3;
  /** Vertical field of view in degrees for a landscape (≥ 16:10) viewport. */
  readonly fov: number;
  /** Horizontal framing shift as a fraction of the viewport (desktop only). Positive moves the scene right. */
  readonly shiftX: number;
  /** Fog start/end distances, so far geometry melts into the sky without washing out the foreground. */
  readonly fogNear: number;
  readonly fogFar: number;
  /** Portrait (phone) framing: view shift as fractions of the viewport; positive Y moves the scene down. */
  readonly portrait: { readonly shiftX: number; readonly shiftY: number; readonly position?: Vec3; readonly target?: Vec3 };
};

/**
 * Camera poses in valley world units (Y up, lake surface at y = 0, trail plateau at y ≈ 2.7).
 * Calibrated against the bounding boxes of LumiKids_Pastel_Valley.glb and its "Hero Camera".
 */
export const CAMERA_SHOTS: readonly CameraShot[] = [
  { name: "vista", position: [12.6, 16.8, 29.9], target: [-0.6, 2.4, -3.2], fov: 40, shiftX: 0.2, fogNear: 37, fogFar: 85, portrait: { shiftX: 0.03, shiftY: 0.12 } },
  { name: "lake", position: [8.6, 6.2, 15.4], target: [2.2, 1.6, 1.2], fov: 42, shiftX: 0.06, fogNear: 22, fogFar: 64, portrait: { shiftX: 0.04, shiftY: 0.08 } },
  { name: "pond", position: [7.4, 1.25, 10.4], target: [3.6, 0.9, 6.6], fov: 40, shiftX: 0.04, fogNear: 18, fogFar: 60, portrait: { shiftX: 0, shiftY: 0.16, position: [4.9, 2.3, 10.1], target: [3.2, 0.25, 7.4] } },
  { name: "elephant", position: [8.8, 1.85, 9.4], target: [6.7, 0.6, 5.5], fov: 40, shiftX: -0.06, fogNear: 16, fogFar: 58, portrait: { shiftX: 0, shiftY: 0.02, position: [8.3, 1.55, 8.9], target: [7.05, 0.85, 5.6] } },
  { name: "waterfall", position: [10.4, 6.3, 8.2], target: [3.2, 4.3, -2.6], fov: 44, shiftX: 0, fogNear: 16, fogFar: 52, portrait: { shiftX: 0, shiftY: 0.04 } },
  { name: "characters", position: [-0.45, 3.46, 6.0], target: [-0.3, 3.0, 2.5], fov: 44, shiftX: 0, fogNear: 14, fogFar: 60, portrait: { shiftX: 0, shiftY: 0.05 } },
  { name: "cabin", position: [2.3, 3.62, 3.4], target: [-0.65, 3.25, -0.55], fov: 45, shiftX: 0.15, fogNear: 14, fogFar: 60, portrait: { shiftX: 0.06, shiftY: 0.3 } },
  // Climb in front of the upper falls (pass-through, no hold); keeps the path clear of cliffs and canopies.
  { name: "climb", position: [6.5, 10.5, 2.0], target: [4.0, 8.0, -4.5], fov: 46, shiftX: 0, fogNear: 18, fogFar: 64, portrait: { shiftX: 0, shiftY: 0.08 } },
  // Above the spring of the top waterfall, looking back down the valley towards the lake (≥ 7 units of clearance).
  { name: "summit", position: [6.0, 13.6, -11.5], target: [1.5, 4.5, 4.0], fov: 44, shiftX: -0.14, fogNear: 22, fogFar: 72, portrait: { shiftX: 0, shiftY: 0.2 } },
  // Farewell: lift away above the valley from its far side, into the evening light.
  { name: "farewell", position: [-20.3, 22.2, -19.3], target: [1.0, 1.6, 2.2], fov: 38, shiftX: 0.2, fogNear: 42, fogFar: 98, portrait: { shiftX: 0.02, shiftY: 0.2 } },
];

/**
 * Story beats in scroll progress (0–1 over the sticky story). The camera stops below and the page overlays
 * in landing-page.tsx are both timed from these, so a beat moves everything with it.
 */
export const STORY = {
  heroHold: [0, 0.04],
  pondHold: [0.15, 0.19],
  elephantHold: [0.21, 0.24],
  /** Characters framed: hotspots fade in on the approach and become clickable here. */
  charactersHold: [0.36, 0.462],
  cabinHold: [0.554, 0.66],
  summitHold: [0.79, 0.84],
  /** Light starts warming while Rabbit and Bear wave at the summit. */
  duskStart: 0.81,
  farewellHold: [0.95, 1],
} as const;

/**
 * Scroll progress → shot index. Equal neighbouring values are holds
 * (hero vista, duck pond, elephant bank, character encounter, cabin reading, summit, farewell).
 */
const PROGRESS_STOPS = [
  ...STORY.heroHold, 0.105, ...STORY.pondHold, ...STORY.elephantHold, 0.3, ...STORY.charactersHold,
  ...STORY.cabinHold, 0.72, ...STORY.summitHold, ...STORY.farewellHold,
];
const SHOT_STOPS = [0, 0, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6, 7, 8, 8, 9, 9];

export const progressToShot = createMonotoneCurve(PROGRESS_STOPS, SHOT_STOPS);
