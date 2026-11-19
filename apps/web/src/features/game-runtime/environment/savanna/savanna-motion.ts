/** Pure, bounded motion curves for the savanna. Time is the stage's active clock in seconds. */
const smooth = (t: number) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};

/** Vertical breathing stretch around the feet: feet stay on the ground, the body rises < 1.2%. */
export function breathing(time: number, phase: number): number {
  return Math.sin(time * 1.35 + phase) * 0.0055 + 0.0055;
}

/** Slow idle weight shift (yaw offset in radians) so a standing animal never looks frozen. */
export function idleTurn(time: number, phase: number): number {
  return Math.sin(time * 0.33 + phase) * 0.045;
}

/** A gentle head sway plus an occasional, curious head tilt every ~9 seconds. */
export function headTilt(time: number, phase: number): number {
  const local = (((time + phase * 3) % 9) + 9) % 9;
  const curious = smooth(local / 1.2) * (1 - smooth((local - 2.6) / 1.4));
  return Math.sin(time * 0.6 + phase) * 0.025 + curious * 0.07;
}

/** Tail swish around its root: quick-ish flick, then rest. */
export function tailSwish(time: number, phase: number): number {
  const local = (((time + phase * 2) % 4.5) + 4.5) % 4.5;
  const flick = local < 1.6 ? Math.sin((local / 1.6) * Math.PI * 2) * Math.sin((local / 1.6) * Math.PI) : 0;
  return flick * 0.32 + Math.sin(time * 0.8 + phase) * 0.05;
}

/** Wind sway for foliage; trees barely move, grass a little more. */
export function windSway(time: number, phase: number, kind: "tree" | "grass"): number {
  return kind === "tree" ? Math.sin(time * 0.38 + phase) * 0.007 : Math.sin(time * 0.85 + phase) * 0.03;
}
