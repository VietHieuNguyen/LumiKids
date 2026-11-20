import type { ChildCorner, GameType } from '@lumikids/shared';

export interface FinishedPlay {
  versionId: string;
  title: string;
  gameType: GameType;
  endedAt: Date;
}

const VIETNAM_OFFSET_MS = 7 * 3_600_000;
const DAY_MS = 86_400_000;
const MAX_STICKERS = 24;

/** Days since the epoch in Vietnam time (UTC+7, no daylight saving). */
const vietnamDay = (at: Date) => Math.floor((at.getTime() + VIETNAM_OFFSET_MS) / DAY_MS);

/** Pure summary of a child's finished plays for "Góc của bé". */
export function summarizeChildPlays(
  plays: readonly FinishedPlay[],
  now: Date,
): Pick<ChildCorner, 'finishedGames' | 'finishedPlays' | 'playedThisWeek' | 'todayIndex' | 'stickers'> {
  const today = vietnamDay(now);
  // 1970-01-01 was a Thursday: shift so Monday is 0.
  const todayIndex = (today + 3) % 7;
  const monday = today - todayIndex;
  const playedThisWeek = Array.from({ length: 7 }, () => false);
  const byVersion = new Map<string, ChildCorner['stickers'][number]>();
  for (const play of plays) {
    const offset = vietnamDay(play.endedAt) - monday;
    if (offset >= 0 && offset < 7) playedThisWeek[offset] = true;
    const sticker = byVersion.get(play.versionId);
    if (!sticker)
      byVersion.set(play.versionId, {
        versionId: play.versionId,
        title: play.title,
        gameType: play.gameType,
        times: 1,
        lastFinishedAt: play.endedAt.toISOString(),
      });
    else {
      sticker.times += 1;
      if (play.endedAt.toISOString() > sticker.lastFinishedAt)
        sticker.lastFinishedAt = play.endedAt.toISOString();
    }
  }
  const stickers = [...byVersion.values()].sort((a, b) =>
    b.lastFinishedAt.localeCompare(a.lastFinishedAt),
  );
  return {
    finishedGames: byVersion.size,
    finishedPlays: plays.length,
    playedThisWeek,
    todayIndex,
    stickers: stickers.slice(0, MAX_STICKERS),
  };
}
