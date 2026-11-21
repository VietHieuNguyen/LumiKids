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
};

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
export function makeSchool(center: Vec3, count: number, seed: number, shape: { radius: readonly [number, number]; depth: number }): Swimmer[] {
  const axis = unit(center);
  const side = unit(cross(axis, Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
  const other = cross(axis, side);
  const next = random(seed);
  const turn = next() < 0.5 ? -1 : 1;
  return Array.from({ length: count }, () => {
    const angle = next() * Math.PI * 2;
    const radius = shape.radius[0] + next() * (shape.radius[1] - shape.radius[0]);
    return {
      center,
      axis,
      offset: add(scale(side, Math.cos(angle) * radius), scale(other, Math.sin(angle) * radius)),
      lift: (next() - 0.5) * shape.depth,
      speed: turn * (0.35 + next() * 0.25),
      bobPhase: next() * Math.PI * 2,
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
  const bob = 0.025 * Math.sin(t * 1.7 + fish.bobPhase);
  const position = add(add(fish.center, around), scale(fish.axis, fish.lift + bob));
  const forward = scale(unit(cross(fish.axis, around)), Math.sign(fish.speed) || 1);
  const radial = unit(position);
  const up = unit(add(radial, scale(forward, -dot(radial, forward))));
  return { position, forward, up };
}
