import { STORY } from "./camera-path";
import type { CameraShot, Vec3 } from "./camera-path";
import { createMonotoneCurve, lerp, seg, smooth } from "./scroll-math";

/**
 * Camera beats for the Arctic globe, in three.js world units (Y up). Points come from
 * public/models/source/arctic/arctic-landing-notes.json (Blender Z-up: three = (x, z, -y)).
 * The beats sit on the valley's STORY timeline so every page overlay keeps its timing:
 * vista = hero, bearGreet = pond (guide caption; the husky stands beside the bear),
 * northEast = its own hold before the encounter (a wide look at the polar bears, the fox and the walrus),
 * iceberg = characters (encounter caption, puffins + seal), campfire = cabin (teacher copy),
 * diveEntry = a pass-through at the water's edge, underwater = summit (the fish school by the orca), farewell.
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
  /** On its own ice at the open left edge, by the puffins and clear of the kayak and the igloo camp. */
  seal: [-4.44, 0.29, 2.86],
  kayak: [-1.17, 1.16, 4.84],
  polarBears: [-0.62, 3.66, 3.92],
  fox: [2.98, 4.32, 1.4],
  walrus: [4.71, 1.57, 1.99],
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

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const along = (v: Vec3, normal: Vec3): Vec3 => unit(add(v, scale(normal, -dot(v, normal))));

/** Under the water at the school's depth, looking across it towards the orca; the surface is "up". */
function underwater(): { position: Vec3; target: Vec3 } {
  const school: Vec3 = [...ARCTIC_POINTS.fishSchool];
  const normal = unit(school);
  const side = along(add(ARCTIC_POINTS.orca, scale(school, -1)), normal);
  return { position: add(add(school, scale(side, -2.4)), scale(normal, 0.15)), target: add(add(school, scale(side, 0.3)), scale(normal, 0.05)) };
}

/** Just above the water over the school, looking across the surface: the dive goes straight down from here. */
function diveEntry(): { position: Vec3; target: Vec3 } {
  const below = underwater();
  return { position: scale(unit(below.position), 5.5), target: scale(unit(below.target), 5.2) };
}

/** A wide look over one side of the globe: camera far out along the mean direction of the given spots. */
function wideOver(spots: readonly Vec3[], distance: number): { position: Vec3; target: Vec3 } {
  const direction = unit(spots.reduce<Vec3>((sum, spot) => add(sum, unit(spot)), [0, 0, 0]));
  return { position: scale(direction, distance), target: scale(direction, 1.5) };
}

/** Two neighbours seen side by side: the camera looks across the line joining them. */
function pairView(a: Vec3, b: Vec3, distance: number, elevationDeg: number): { position: Vec3; target: Vec3 } {
  const middle = scale(add(a, b), 0.5);
  return closeUp(middle, distance, elevationDeg, cross(unit(middle), add(b, scale(a, -1))), 0.2);
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
  shot("bearGreet", closeUp(ARCTIC_POINTS.bear, 3.4, 12, toward(ARCTIC_POINTS.bear, CAMP_VIEW), 0.3), 40, 0.12, 0.12),
  shot("northEast", wideOver([ARCTIC_POINTS.polarBears, ARCTIC_POINTS.fox, ARCTIC_POINTS.walrus], 14), 40, 0.06, 0.1),
  shot("iceberg", pairView(ARCTIC_POINTS.puffins, ARCTIC_POINTS.seal, 4.6, 16), 40, -0.04, 0.1),
  shot("campfire", closeUp(ARCTIC_POINTS.campfire, 3.0, 12, toward(ARCTIC_POINTS.campfire, CAMP_VIEW), 0.2), 42, 0.15, 0.25),
  shot("diveEntry", diveEntry(), 50, -0.1, 0.18),
  shot("underwater", underwater(), 55, -0.24, 0.18, 1.05),
  shot("farewell", { position: [-10.6, 9.5, 15.1], target: [0, 0.2, 0] }, 38, 0.2, 0.2),
];

/**
 * Where the camera stands still. The holds that carry page copy are the valley story's (pond caption,
 * encounter, teacher copy, kids copy, farewell); the north-east look has a hold of its own in between.
 */
export const ARCTIC_HOLDS = {
  heroHold: STORY.heroHold,
  pondHold: STORY.pondHold,
  northEastHold: [0.255, 0.3] as const,
  charactersHold: STORY.charactersHold,
  cabinHold: STORY.cabinHold,
  summitHold: STORY.summitHold,
  farewellHold: STORY.farewellHold,
};

/** Scroll progress → shot index; equal neighbours are holds. */
const PROGRESS_STOPS = [
  ...ARCTIC_HOLDS.heroHold, ...ARCTIC_HOLDS.pondHold, ...ARCTIC_HOLDS.northEastHold, ...ARCTIC_HOLDS.charactersHold,
  ...ARCTIC_HOLDS.cabinHold, 0.725, ...ARCTIC_HOLDS.summitHold, ...ARCTIC_HOLDS.farewellHold,
];
const SHOT_STOPS = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 6, 6, 7, 7];
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

/** Blend two screen-ups by `t`, then square the result to the view. */
function blendUp(a: Vec3, b: Vec3, t: number, position: Vec3, target: Vec3): Vec3 {
  const look = unit(add(target, scale(position, -1)));
  const mixed = add(scale(a, 1 - t), scale(b, t));
  const square = add(mixed, scale(look, -dot(mixed, look)));
  return length(square) > 1e-6 ? unit(square) : cameraUp(position, target);
}

/**
 * Screen "up": the local ground normal near the surface (and towards the surface under water), world up
 * for wide shots aimed at the globe centre. Both are taken square to the view, and the ground normal
 * gives way to world up whenever it points along the view, so the picture never rolls over.
 */
function cameraUp(position: Vec3, target: Vec3): Vec3 {
  const offset = add(target, scale(position, -1));
  if (length(offset) < 1e-9) return [0, 1, 0];
  const look = unit(offset);
  const square = (v: Vec3): Vec3 => add(v, scale(look, -dot(v, look)));
  const worldUp = square([0, 1, 0]);
  const r = length(target);
  const ground = r < 1e-6 ? worldUp : square(unit(target));
  const k = smooth(seg(r / ARCTIC_GLOBE.radius, 0.15, 0.75)) * smooth(seg(length(ground), 0.25, 0.6));
  const blended = add(scale(length(worldUp) > 1e-6 ? unit(worldUp) : [0, 0, 1], 1 - k), scale(length(ground) > 1e-6 ? unit(ground) : [0, 0, 1], k));
  return length(blended) > 1e-6 ? unit(blended) : [0, 1, 0];
}

/** Each stop's own screen-up (desktop / portrait), blended evenly through a transition so the turn is spread out. */
let shotUps: { desktop: Vec3; portrait: Vec3 }[] | null = null;
function upsOf(): { desktop: Vec3; portrait: Vec3 }[] {
  shotUps ??= ARCTIC_SHOTS.map((s) => ({
    desktop: cameraUp(s.position, s.target),
    portrait: cameraUp(s.portrait.position ?? s.position, s.portrait.target ?? s.target),
  }));
  return shotUps;
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
  const position = orbitBlend(pa, pb, t);
  return {
    position,
    target,
    up: blendUp(upsOf()[i][portrait ? "portrait" : "desktop"], upsOf()[i + 1][portrait ? "portrait" : "desktop"], t, position, target),
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

function rotate(v: Vec3, q: Quat): Vec3 {
  const [qx, qy, qz, qw] = q;
  const ix = qw * v[0] + qy * v[2] - qz * v[1];
  const iy = qw * v[1] + qz * v[0] - qx * v[2];
  const iz = qw * v[2] + qx * v[1] - qy * v[0];
  const iw = -qx * v[0] - qy * v[1] - qz * v[2];
  return [ix * qw - iw * qx - iy * qz + iz * qy, iy * qw - iw * qy - iz * qx + ix * qz, iz * qw - iw * qz - ix * qy + iy * qx];
}

type Frame = { right: Vec3; up: Vec3; back: Vec3 };

function frameOf(position: Vec3, target: Vec3, up: Vec3): Frame {
  const back = unit(add(position, scale(target, -1)));
  return { right: cross(up, back), up, back };
}

/** The rotation taking frame `from` onto frame `to` (both orthonormal), as a quaternion (x, y, z, w). */
function frameRotation(from: Frame, to: Frame): Quat {
  // m = To · Fromᵀ, columns of each frame being (right, up, back).
  const m = (i: number, j: number) => to.right[i] * from.right[j] + to.up[i] * from.up[j] + to.back[i] * from.back[j];
  const trace = m(0, 0) + m(1, 1) + m(2, 2);
  let q: Quat;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    q = [(m(2, 1) - m(1, 2)) * s, (m(0, 2) - m(2, 0)) * s, (m(1, 0) - m(0, 1)) * s, 0.25 / s];
  } else if (m(0, 0) > m(1, 1) && m(0, 0) > m(2, 2)) {
    const s = 2 * Math.sqrt(1 + m(0, 0) - m(1, 1) - m(2, 2));
    q = [0.25 * s, (m(0, 1) + m(1, 0)) / s, (m(0, 2) + m(2, 0)) / s, (m(2, 1) - m(1, 2)) / s];
  } else if (m(1, 1) > m(2, 2)) {
    const s = 2 * Math.sqrt(1 + m(1, 1) - m(0, 0) - m(2, 2));
    q = [(m(0, 1) + m(1, 0)) / s, 0.25 * s, (m(1, 2) + m(2, 1)) / s, (m(0, 2) - m(2, 0)) / s];
  } else {
    const s = 2 * Math.sqrt(1 + m(2, 2) - m(0, 0) - m(1, 1));
    q = [(m(0, 2) + m(2, 0)) / s, (m(1, 2) + m(2, 1)) / s, 0.25 * s, (m(1, 0) - m(0, 1)) / s];
  }
  const l = Math.hypot(...q);
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

const HERO = arcticShotAt(0);
/** The camera's one heading and up for the whole journey: the hero view's. */
const CAMERA_FRAME = frameOf(HERO.position, HERO.target, HERO.up);

export type ArcticView = { globe: Quat; position: Vec3; target: Vec3; up: Vec3; fov: number; shiftX: number; shiftY: number };

/**
 * The same shot as arcticShotAt, but the camera never turns: the globe turns (in full 3D) so the shot's
 * view of it lines up with the hero camera's heading and up. Every stop is upright on screen, lit from the
 * same side, and the picture never rolls. `globe` is the globe's rotation (x, y, z, w); the rest is world space.
 */
export function arcticViewAt(p: number, portrait = false): ArcticView {
  const local = arcticShotAt(p, portrait);
  const globe = frameRotation(frameOf(local.position, local.target, local.up), CAMERA_FRAME);
  return { ...local, globe, position: rotate(local.position, globe), target: rotate(local.target, globe), up: CAMERA_FRAME.up };
}
