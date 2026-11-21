import { ARCTIC_GLOBE, ARCTIC_HOLDS, arcticShotAt } from "./arctic-path";
import type { Vec3 } from "./camera-path";

/** One fish milling round its school: a circle about the school's radial axis, with a gentle bob. */
export type Swimmer = {
  center: Vec3;
  /** The radial direction at the school centre (towards the surface); the circle turns about it. */
  axis: Vec3;
  /** Start position relative to the centre, square to the axis. */
  offset: Vec3;
  /** Height above (+) or below (−) the centre along the axis. */
  lift: number;
  /** Angular speed in rad/s (sign = turning direction). */
  speed: number;
  bobPhase: number;
  /** How far it rises and sinks while swimming. */
  bob: number;
};

/**
 * The shape of a school: ring radius, thickness, and (optionally) its speed range in rad/s and bob height.
 * `evenly` spaces the swimmers round the ring at one radius and one speed, so big animals never catch each other up.
 */
export type SchoolShape = { radius: readonly [number, number]; depth: number; speed?: readonly [number, number]; bob?: number; evenly?: boolean };

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Vec3): Vec3 => scale(a, 1 / Math.hypot(a[0], a[1], a[2]));

function random(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A school of `count` fish round `center`, deterministic for a seed (so renders never reshuffle). */
export function makeSchool(center: Vec3, count: number, seed: number, shape: SchoolShape): Swimmer[] {
  const [slow, fast] = shape.speed ?? [0.35, 0.6];
  const axis = unit(center);
  const side = unit(cross(axis, Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
  const other = cross(axis, side);
  const next = random(seed);
  const turn = next() < 0.5 ? -1 : 1;
  const start = next() * Math.PI * 2;
  const shared = slow + next() * (fast - slow);
  const middle = (shape.radius[0] + shape.radius[1]) / 2;
  return Array.from({ length: count }, (_, index) => {
    const angle = shape.evenly ? start + (index * Math.PI * 2) / count : next() * Math.PI * 2;
    const radius = shape.evenly ? middle : shape.radius[0] + next() * (shape.radius[1] - shape.radius[0]);
    return {
      center,
      axis,
      offset: add(scale(side, Math.cos(angle) * radius), scale(other, Math.sin(angle) * radius)),
      lift: (next() - 0.5) * shape.depth,
      speed: turn * (shape.evenly ? shared : slow + next() * (fast - slow)),
      bobPhase: next() * Math.PI * 2,
      bob: shape.bob ?? 0.025,
    };
  });
}

function turnAbout(v: Vec3, axis: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return add(add(scale(v, c), scale(cross(axis, v), s)), scale(axis, dot(axis, v) * (1 - c)));
}

/** Where a fish is at `t` seconds, which way its nose points and which way its back points (globe-local). */
export function swimPose(fish: Swimmer, t: number): { position: Vec3; forward: Vec3; up: Vec3 } {
  const around = turnAbout(fish.offset, fish.axis, fish.speed * t);
  const bob = fish.bob * Math.sin(t * 1.7 + fish.bobPhase);
  const position = add(add(fish.center, around), scale(fish.axis, fish.lift + bob));
  const forward = scale(unit(cross(fish.axis, around)), Math.sign(fish.speed) || 1);
  const radial = unit(position);
  const up = unit(add(radial, scale(forward, -dot(radial, forward))));
  return { position, forward, up };
}

/** Level a heading on the sphere: back to the surface (`radial`), nose along what is left of `heading`. */
export function uprightOn(heading: Vec3, radial: Vec3): { forward: Vec3; up: Vec3 } {
  const up = unit(radial);
  const forward = unit(add(heading, scale(up, -dot(heading, up))));
  return { forward, up };
}

/** A spot in the underwater shot's own frame: `ahead` along the view, then right and up on screen. */
function inView(ahead: number, right: number, up: number): Vec3 {
  const shot = arcticShotAt((ARCTIC_HOLDS.summitHold[0] + ARCTIC_HOLDS.summitHold[1]) / 2);
  const look = unit(add(shot.target, scale(shot.position, -1)));
  const screenRight = unit(cross(look, shot.up));
  const screenUp = cross(screenRight, look);
  return add(add(add(shot.position, scale(look, ahead)), scale(screenRight, right)), scale(screenUp, up));
}

/**
 * Where each group swims in the underwater shot, spread over the picture: the dolphins in the open water above
 * the orca, the goldfish to the left, the tuna low on the right and two manta rays gliding underneath. All but the
 * goldfish are slow. The goldfish `count` is how many extra copies join the file's fish by the orca; most goldfish
 * swim in the open water instead (ARCTIC_OPEN_WATER).
 */
export const ARCTIC_SEA = {
  goldfish: { center: inView(2.3, -0.85, 0.3), count: 6, shape: { radius: [0.45, 1.25], depth: 0.9 } },
  tuna: { center: inView(2.6, -1.0, -0.55), count: 9, shape: { radius: [0.45, 0.95], depth: 0.45, speed: [0.18, 0.3], bob: 0.03 } },
  dolphins: { center: inView(3.2, 0.9, 0.55), count: 3, shape: { radius: [0.68, 0.7], depth: 0.2, speed: [0.12, 0.16], bob: 0.09, evenly: true } },
  mantas: { center: inView(5.0, 0.0, -1.4), count: 2, shape: { radius: [0.8, 0.85], depth: 0.15, speed: [0.08, 0.1], bob: 0.05, evenly: true } },
} as const satisfies Record<string, { center: Vec3; count: number; shape: SchoolShape }>;

/** A point `depth` below the surface in the direction of a spot on the globe. */
const underSea = (spot: Vec3, depth = 0.7): Vec3 => {
  const k = (ARCTIC_GLOBE.radius - depth) / Math.hypot(...spot);
  return [spot[0] * k, spot[1] * k, spot[2] * k];
};

/**
 * Small goldfish schools in the open water round the rest of the globe (found in the blend's clearest water),
 * so the slowly turning hero globe never shows an empty sea while the orca side is busy.
 */
const OPEN_WATER_SPOTS: readonly Vec3[] = [
  [4.52, 1.65, -1.54],
  [3.43, 2.59, -2.65],
  [-1.8, -2.45, -4.03],
  [-4.46, 2.28, 0.63],
  [-3.62, -2.83, 2.1],
];
export const ARCTIC_OPEN_WATER: readonly { center: Vec3; count: number; shape: SchoolShape }[] = OPEN_WATER_SPOTS.map((spot) => ({ center: underSea(spot), count: 12, shape: { radius: [0.35, 0.75] as const, depth: 0.3, speed: [0.3, 0.5] as const, bob: 0.04 } }));
