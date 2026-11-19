/** Seconds from the stage's active clock: hidden tabs and reduced motion never advance it. */
const clamp = (t: number) => Math.max(0, Math.min(1, t));
const smooth = (t: number) => { const x = clamp(t); return x * x * (3 - 2 * x); };

export function drinkingWeight(time: number): number {
  const t = ((time % 12) + 12) % 12;
  if (t < 7) return 1;
  if (t < 9) return 1 - smooth((t - 7) / 2);
  if (t < 10) return 0;
  return smooth((t - 10) / 2);
}

export function deerSipWeight(clipTime: number): number {
  return smooth((clipTime - 0.55) / 0.65) * (1 - smooth((clipTime - 3.9) / 0.7));
}

export function driftAcross(time: number, initialX: number, period = 110): number {
  const left = -0.28, span = 1.56;
  return left + ((initialX - left + time * span / period) % span + span) % span;
}

export function duckSwim(time: number, phase: number) {
  const angle = time * 0.19 + phase;
  return {
    offsetX: Math.sin(angle) * (phase === 0 ? 0.075 : 0.06),
    offsetY: Math.sin(angle * 2) * 0.005,
    // A soft turn towards the camera before paddling the other way; no instant mirror flip.
    heading: Math.tanh(Math.cos(angle) * 4) * 1.05,
  };
}

export const FROG_HOP_DURATION = 1.25;
export function frogHop(time: number) {
  const cycle = Math.floor(Math.max(0, time) / 15);
  const age = Math.max(0, time) - cycle * 15 - 9;
  const progress = clamp(age / FROG_HOP_DURATION);
  const travel = smooth((progress - 0.18) / 0.64);
  return {
    key: cycle,
    from: cycle % 2,
    to: (cycle + 1) % 2,
    active: age >= 0 && age < FROG_HOP_DURATION,
    progress,
    travel,
    arc: Math.sin(travel * Math.PI),
  };
}

export function birdFlight(time: number, index: number) {
  const start = 4 + index * 0.7;
  const age = time - start;
  const local = ((age % 34) + 34) % 34;
  return {
    visible: age >= 0 && local < 16,
    x: -0.18 + local / 16 * 1.36,
    y: 0.075 + index * 0.023 + Math.sin(local * 0.45 + index) * 0.009,
    flap: Math.sin(time * 5 + index * 1.5) * 0.55,
  };
}
