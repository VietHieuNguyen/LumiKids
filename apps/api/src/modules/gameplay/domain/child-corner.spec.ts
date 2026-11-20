import { summarizeChildPlays } from './child-corner.js';

const play = (versionId: string, endedAt: string) => ({
  versionId,
  title: `Trò ${versionId.slice(0, 4)}`,
  gameType: 'COUNTING' as const,
  endedAt: new Date(endedAt),
});
const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';

describe('summarizeChildPlays', () => {
  // Friday 20/11/2026, 13:00 in Vietnam.
  const now = new Date('2026-11-20T06:00:00.000Z');

  it('marks the days of this week (Vietnam time) on which a play was finished', () => {
    const summary = summarizeChildPlays(
      [
        play(A, '2026-11-16T01:00:00.000Z'), // Monday morning
        play(A, '2026-11-17T17:30:00.000Z'), // 00:30 Wednesday in Vietnam, still Tuesday in UTC
        play(B, '2026-11-15T10:00:00.000Z'), // last Sunday: not this week
      ],
      now,
    );
    expect(summary.todayIndex).toBe(4);
    expect(summary.playedThisWeek).toEqual([true, false, true, false, false, false, false]);
  });

  it('gives one sticker per game, latest first, counting replays', () => {
    const summary = summarizeChildPlays(
      [play(A, '2026-11-10T01:00:00.000Z'), play(B, '2026-11-12T01:00:00.000Z'), play(A, '2026-11-19T01:00:00.000Z')],
      now,
    );
    expect(summary.finishedGames).toBe(2);
    expect(summary.finishedPlays).toBe(3);
    expect(summary.stickers.map((sticker) => [sticker.versionId, sticker.times])).toEqual([
      [A, 2],
      [B, 1],
    ]);
  });

  it('is empty, not an error, for a child who has not finished anything', () => {
    const summary = summarizeChildPlays([], now);
    expect(summary).toMatchObject({ finishedGames: 0, finishedPlays: 0, stickers: [] });
    expect(summary.playedThisWeek.every((day) => !day)).toBe(true);
  });
});
