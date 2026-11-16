/** Pure wording for the admin screens (covered by the web tests). */

/** "Hôm nay", "Hôm qua", "5 ngày trước", "Chưa đăng nhập". */
export function lastSeenLabel(value: string | null, now: Date): string {
  if (!value) return "Chưa đăng nhập";
  const days = Math.floor((now.getTime() - new Date(value).getTime()) / 86_400_000);
  if (days <= 0) return "Hôm nay";
  if (days === 1) return "Hôm qua";
  if (days < 60) return `${days} ngày trước`;
  return `${Math.floor(days / 30)} tháng trước`;
}

/** Whole-number percentage, or null when there is nothing to divide by. */
export function percent(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

/** Week-over-week change: "+25%", "−40%", "Mới" (from zero), "Như tuần trước". */
export function trendLabel(current: number, previous: number): { text: string; direction: "up" | "down" | "flat" } {
  if (current === previous) return { text: "Như tuần trước", direction: "flat" };
  if (previous === 0) return { text: "Mới có hoạt động", direction: "up" };
  const change = Math.round(((current - previous) / previous) * 100);
  return change > 0 ? { text: `+${change}% so với tuần trước`, direction: "up" } : { text: `−${Math.abs(change)}% so với tuần trước`, direction: "down" };
}

/** "T2 17/11" for a "YYYY-MM-DD" calendar day (no time zone shift). */
export function shortDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  const weekday = new Date(Date.UTC(year, month - 1, date)).getUTCDay();
  return `${weekday === 0 ? "CN" : `T${weekday + 1}`} ${String(date).padStart(2, "0")}/${String(month).padStart(2, "0")}`;
}
