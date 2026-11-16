/** Child-facing wording (pure: covered by the web tests). Short, concrete, no dates a 4-year-old can't read. */

/** Vietnamese given name: the last word of the full name ("Nguyễn Minh An" → "An"). */
export function givenName(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  return words.at(-1) ?? "con";
}

function localDayNumber(date: Date): number {
  return Math.floor((date.getTime() - date.getTimezoneOffset() * 60000) / 86400000);
}

/**
 * How long the child still has, in days rather than dates: "Hôm nay là hết hạn", "Còn 2 ngày"…
 * `null` when there is no deadline (nothing to show).
 */
export function deadlineLabel(playableUntil: string | null, now: Date): { text: string; urgent: boolean } | null {
  if (!playableUntil) return null;
  const until = new Date(playableUntil);
  if (Number.isNaN(until.getTime())) return null;
  if (until < now) return { text: "Đã hết giờ", urgent: true };
  const days = localDayNumber(until) - localDayNumber(now);
  if (days <= 0) return { text: "Hạn chót hôm nay", urgent: true };
  if (days === 1) return { text: "Còn đến ngày mai", urgent: true };
  return { text: `Còn ${days} ngày`, urgent: false };
}

/** "Con làm được 1 trên 3 trò" — also read aloud. */
export function progressSentence(done: number, total: number): string {
  if (total > 0 && done >= total) return "Con làm xong hết rồi!";
  if (done === 0) return `Có ${total} trò đang chờ con.`;
  return `Con xong ${done} trên ${total} trò rồi.`;
}
