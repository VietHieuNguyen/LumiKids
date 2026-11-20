/**
 * In-process sliding-window counter (like the Nest throttler, it is per API process).
 * `take(key)` records one use and returns false when the key is already at its limit.
 */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  take(key: string): boolean {
    const now = this.now();
    const recent = (this.hits.get(key) ?? []).filter((at) => now - at < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    // Keep the map small: drop keys whose window has fully passed.
    if (this.hits.size > 10_000)
      for (const [entry, times] of this.hits)
        if (!times.some((at) => now - at < this.windowMs)) this.hits.delete(entry);
    return true;
  }
}
