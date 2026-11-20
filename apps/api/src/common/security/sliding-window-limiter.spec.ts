import { SlidingWindowLimiter } from './sliding-window-limiter.js';

describe('SlidingWindowLimiter', () => {
  it('allows `limit` uses per window and frees them as the window slides', () => {
    let now = 0;
    const limiter = new SlidingWindowLimiter(2, 1000, () => now);
    expect(limiter.take('a')).toBe(true);
    expect(limiter.take('a')).toBe(true);
    expect(limiter.take('a')).toBe(false);
    expect(limiter.take('b')).toBe(true);
    now = 999;
    expect(limiter.take('a')).toBe(false);
    now = 1000;
    expect(limiter.take('a')).toBe(true);
  });
});
