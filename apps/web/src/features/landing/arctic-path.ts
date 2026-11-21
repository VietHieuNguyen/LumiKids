import { STORY } from "./camera-path";
import type { CameraShot, Vec3 } from "./camera-path";
import { createMonotoneCurve, lerp, seg, smooth } from "./scroll-math";

/**
 * Camera beats for the Arctic globe, in three.js world units (Y up). Points come from
 * public/models/source/arctic/arctic-landing-notes.json (Blender Z-up: three = (x, z, -y)).
 * The beats sit on the valley's STORY timeline so every page overlay keeps its timing:
 * vista = hero, bearGreet = pond (guide caption), husky = elephant (a short slide, like the valley's),
 * polarBears = the 0.3 pass-through, iceberg = characters (encounter caption, puffins + seal),
 * campfire = cabin (teacher copy), underwater = summit (a dive to the fish school by the orca), farewell = farewell.
 * The camera never flies round the globe on screen: arcticViewAt turns the globe (like a desk globe)
 * so each stop comes to the front, and the camera stays in front of it under the same lights.
 */
export const ARCTIC_GLOBE = { center: [0, 0, 0] as Vec3, radius: 5.05 };

/** Where things stand on the globe (three.js coordinates). */
export const ARCTIC_POINTS = {
  bear: [-0.46, -0.89, 5.48],
  husky: [-0.12, -1.45, 5.43],
  campfire: [-1.02, -1.34, 5.37],
  lantern: [-2.1, -0.44, 5.18],
  puffins: [-3.94, 2.14, 2.67],
  seal: [-2.36, 1.0, 4.63],
  polarBears: [-0.62, 3.66, 3.92],
  fox: [2.98, 4.32, 1.4],
  /** Centre of the goldfish school swimming by the orca, under the surface. */
  fishSchool: [2.07, -0.38, 3.03],
  orca: [1.65, 0.55, 3.58],
} as const satisfies Record<string, Vec3>;

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec3): Vec3 => scale(a, 1 / length(a));

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * A close shot of a spot on the globe, seen at an angle like a person standing on the ice:
 * the camera sits `distance` away, `elevationDeg` above the local ground, on the side `heading` points to.
 */
function closeUp(spot: Vec3, distance: number, elevationDeg: number, heading: Vec3, lookLift: number): { position: Vec3; target: Vec3 } {
  const normal = unit(spot);
  const along = unit(add(heading, scale(normal, -dot(heading, normal))));
  const e = (elevationDeg * Math.PI) / 180;
  const offset = add(scale(normal, Math.sin(e) * distance), scale(along, Math.cos(e) * distance));
  return { position: add(spot, offset), target: add(spot, scale(normal, lookLift)) };
}

/** Where the bear and the campfire face (the v8 camp camera), so they are seen from the front. */
const CAMP_VIEW: Vec3 = [1.26, -0.05, 9.12];
const toward = (from: Vec3, to: Vec3): Vec3 => add(to, scale(from, -1));

/** Under the water, below the fish school, looking up past it to the orca and the bright surface. */
function underwater(): { position: Vec3; target: Vec3 } {
  const school: Vec3 = [...ARCTIC_POINTS.fishSchool];
  const toOrca = add(ARCTIC_POINTS.orca, scale(school, -1));
  return { position: add(school, scale(unit(toOrca), -2.9)), target: add(school, scale(toOrca, 0.35)) };
}

function shot(name: string, view: { position: Vec3; target: Vec3 }, fov: number, shiftX: number, portraitShiftY: number, portraitBack = 1.4): CameraShot {
  // Narrow screens back the camera off along the same line so the subject stays whole.
  const back = add(view.target, scale(add(view.position, scale(view.target, -1)), portraitBack));
  return {
    name,
    position: view.position,
    target: view.target,
    fov,
    shiftX,
    fogNear: 30,
    fogFar: 90,
    portrait: { shiftX: 0, shiftY: portraitShiftY, position: back, target: view.target },
  };
}

export const ARCTIC_SHOTS: readonly CameraShot[] = [
  shot("vista", { position: [6.74, 7.12, 17.62], target: [0, -0.1, 0] }, 40, 0.2, 0.1),
  shot("bearGreet", closeUp(ARCTIC_POINTS.bear, 2.6, 12, toward(ARCTIC_POINTS.bear, CAMP_VIEW), 0.3), 40, 0.12, 0.12),
  shot("husky", closeUp(ARCTIC_POINTS.husky, 2.3, 14, add(toward(ARCTIC_POINTS.husky, CAMP_VIEW), [1.2, 0, 0]), 0.2), 40, 0.1, 0.12),
  shot("polarBears", closeUp(ARCTIC_POINTS.polarBears, 3.8, 16, [0.2, -1, 0.4], 0.35), 42, 0.06, 0.1),
  shot("iceberg", closeUp(ARCTIC_POINTS.puffins, 1.5, 12, [0.7, -0.5, 1], 0.12), 40, -0.04, 0.1),
  shot("campfire", closeUp(ARCTIC_POINTS.campfire, 2.3, 12, toward(ARCTIC_POINTS.campfire, CAMP_VIEW), 0.2), 42, 0.15, 0.25),
  shot("underwater", underwater(), 50, -0.24, 0.18, 1.05),
  shot("farewell", { position: [-10.6, 9.5, 15.1], target: [0, 0.2, 0] }, 38, 0.2, 0.2),
];

/** Scroll progress → shot index; equal neighbours are holds (same stops as the valley story). */
const PROGRESS_STOPS = [
  ...STORY.heroHold, ...STORY.pondHold, ...STORY.elephantHold, 0.3, ...STORY.charactersHold,
  ...STORY.cabinHold, ...STORY.summitHold, ...STORY.farewellHold,
];
const SHOT_STOPS = [0, 0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6, 7, 7];
const progressToShot = createMonotoneCurve(PROGRESS_STOPS, SHOT_STOPS);

/** Spherical blend around the globe: directions slerp, distances lerp, so the path never cuts through it. */
function orbitBlend(a: Vec3, b: Vec3, t: number): Vec3 {
  const ra = length(a);
  const rb = length(b);
  const ua = scale(a, 1 / ra);
  const ub = scale(b, 1 / rb);
  const dot = Math.min(1, Math.max(-1, ua[0] * ub[0] + ua[1] * ub[1] + ua[2] * ub[2]));
  const angle = Math.acos(dot);
  let direction: Vec3;
  if (angle < 1e-5) direction = ua;
  else {
    const s = Math.sin(angle);
    direction = add(scale(ua, Math.sin((1 - t) * angle) / s), scale(ub, Math.sin(t * angle) / s));
  }
  return scale(direction, lerp(ra, rb, t));
}

export type ArcticCamera = { position: Vec3; target: Vec3; up: Vec3; fov: number; shiftX: number; shiftY: number };

/** Screen "up": the local ground normal near the surface, world up for wide shots aimed at the globe centre. */
function cameraUp(target: Vec3): Vec3 {
  const r = length(target);
  if (r < 1e-6) return [0, 1, 0];
  const k = smooth(seg(r / ARCTIC_GLOBE.radius, 0.3, 0.9));
  return unit(add(scale([0, 1, 0], 1 - k), scale(unit(target), k)));
}

export function arcticShotAt(p: number, portrait = false): ArcticCamera {
  const s = Math.min(ARCTIC_SHOTS.length - 1, Math.max(0, progressToShot(p)));
  const i = Math.min(ARCTIC_SHOTS.length - 2, Math.floor(s));
  const t = s - i;
  const a = ARCTIC_SHOTS[i];
  const b = ARCTIC_SHOTS[i + 1];
  const pa = portrait ? (a.portrait.position ?? a.position) : a.position;
  const pb = portrait ? (b.portrait.position ?? b.position) : b.position;
  const ta = portrait ? (a.portrait.target ?? a.target) : a.target;
  const tb = portrait ? (b.portrait.target ?? b.target) : b.target;
  const target: Vec3 = [lerp(ta[0], tb[0], t), lerp(ta[1], tb[1], t), lerp(ta[2], tb[2], t)];
  return {
    position: orbitBlend(pa, pb, t),
    target,
    up: cameraUp(target),
    fov: lerp(a.fov, b.fov, t),
    shiftX: portrait ? lerp(a.portrait.shiftX, b.portrait.shiftX, t) : lerp(a.shiftX, b.shiftX, t),
    shiftY: portrait ? lerp(a.portrait.shiftY, b.portrait.shiftY, t) : 0,
  };
}

/** 0 = pastel midday, 1 = warm campfire dusk; reached as the campfire beat settles and kept to the end. */
export function arcticWarmth(p: number): number {
  return smooth(seg(p, STORY.charactersHold[1], STORY.cabinHold[0]));
}

type Quat = [number, number, number, number];

const quatAxis = (axis: Vec3, angle: number): Quat => {
  const h = angle / 2;
  const k = Math.sin(h);
  return [axis[0] * k, axis[1] * k, axis[2] * k, Math.cos(h)];
};
const quatMul = (a: Quat, b: Quat): Quat => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
function rotate(v: Vec3, q: Quat): Vec3 {
  const [qx, qy, qz, qw] = q;
  const ix = qw * v[0] + qy * v[2] - qz * v[1];
  const iy = qw * v[1] + qz * v[0] - qx * v[2];
  const iz = qw * v[2] + qx * v[1] - qy * v[0];
  const iw = -qx * v[0] - qy * v[1] - qz * v[2];
  return [ix * qw - iw * qx - iy * qz + iz * qy, iy * qw - iw * qy - iz * qx + ix * qz, iz * qw - iw * qz - ix * qy + iy * qx];
}

/** Where the camera always stands, seen from the globe centre: the hero view's direction. */
export const ARCTIC_FRONT: Vec3 = unit(ARCTIC_SHOTS[0].position);
const FRONT_YAW = Math.atan2(ARCTIC_FRONT[0], ARCTIC_FRONT[2]);
const FRONT_PITCH = Math.asin(ARCTIC_FRONT[1]);
const PITCH_AXIS: Vec3 = [Math.cos(FRONT_YAW), 0, -Math.sin(FRONT_YAW)];

export type ArcticView = { globe: Quat; position: Vec3; target: Vec3; up: Vec3; fov: number; shiftX: number; shiftY: number };

/**
 * The same shot as arcticShotAt, but the globe turns instead of the camera flying round it: a turn about
 * the vertical axis then a tilt brings the shot's camera direction to ARCTIC_FRONT. `globe` is the
 * globe's rotation (x, y, z, w); position/target/up are in world space.
 */
export function arcticViewAt(p: number, portrait = false): ArcticView {
  const local = arcticShotAt(p, portrait);
  const d = unit(local.position);
  const yaw = Math.atan2(d[0], d[2]);
  const pitch = Math.asin(Math.max(-1, Math.min(1, d[1])));
  const globe = quatMul(quatAxis(PITCH_AXIS, pitch - FRONT_PITCH), quatAxis([0, 1, 0], FRONT_YAW - yaw));
  const target = rotate(local.target, globe);
  return { ...local, globe, position: rotate(local.position, globe), target, up: cameraUp(target) };
}
