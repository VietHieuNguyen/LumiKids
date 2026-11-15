export function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

/** Normalised position of `x` inside [a, b], clamped to [0, 1]. */
export function seg(x: number, a: number, b: number): number {
  return clamp((x - a) / (b - a));
}

export function smooth(t: number): number {
  const x = clamp(t);
  return x * x * (3 - 2 * x);
}

export function easeInOutCubic(t: number): number {
  const x = clamp(t);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Monotone cubic (Fritsch–Carlson) interpolation through sorted points.
 * Flat runs stay perfectly flat (camera holds) while moving runs keep a
 * continuous velocity, so the camera never "stops and restarts" mid-flight.
 */
export function createMonotoneCurve(xs: readonly number[], ys: readonly number[]): (x: number) => number {
  const n = xs.length;
  const delta: number[] = [];
  for (let i = 0; i < n - 1; i += 1) delta.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  const tangent: number[] = new Array<number>(n).fill(0);
  tangent[0] = delta[0];
  tangent[n - 1] = delta[n - 2];
  for (let i = 1; i < n - 1; i += 1) {
    tangent[i] = delta[i - 1] * delta[i] <= 0 ? 0 : (delta[i - 1] + delta[i]) / 2;
  }
  for (let i = 0; i < n - 1; i += 1) {
    if (delta[i] === 0) {
      tangent[i] = 0;
      tangent[i + 1] = 0;
      continue;
    }
    const a = tangent[i] / delta[i];
    const b = tangent[i + 1] / delta[i];
    const h = a * a + b * b;
    if (h > 9) {
      const s = 3 / Math.sqrt(h);
      tangent[i] = s * a * delta[i];
      tangent[i + 1] = s * b * delta[i];
    }
  }
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i += 1;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i]
      + (t3 - 2 * t2 + t) * h * tangent[i]
      + (-2 * t3 + 3 * t2) * ys[i + 1]
      + (t3 - t2) * h * tangent[i + 1];
  };
}
