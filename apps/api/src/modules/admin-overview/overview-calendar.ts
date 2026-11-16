/** Pure calendar helpers for the admin dashboard (no I/O; unit tested). */

/** Days are counted in the school's time zone, not the server's. */
export const SCHOOL_TIME_ZONE = 'Asia/Ho_Chi_Minh';

/** "YYYY-MM-DD" of `instant` in `timeZone`. */
export function localDay(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/** Calendar arithmetic on "YYYY-MM-DD" strings (UTC-based, so no DST surprises). */
export function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) /
      86_400_000,
  );
}

export interface DayRow {
  day: string;
  sessions: number;
  completed: number;
  children: number;
}

/** `count` consecutive days ending at `lastDay`, oldest first, missing days as zeros. */
export function fillDays(
  rows: readonly DayRow[],
  lastDay: string,
  count: number,
) {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  return Array.from({ length: count }, (_, index) => {
    const date = shiftDay(lastDay, index - count + 1);
    const row = byDay.get(date);
    return {
      date,
      sessions: row?.sessions ?? 0,
      completed: row?.completed ?? 0,
      children: row?.children ?? 0,
    };
  });
}

export interface YearRow {
  schoolYearId: string;
  name: string;
  startDate: string;
  endDate: string;
}

/** The year containing today; else the latest that started; else the next to start. */
export function currentYear(years: readonly YearRow[], today: string) {
  const sorted = [...years].sort((a, b) =>
    a.startDate.localeCompare(b.startDate),
  );
  const year =
    sorted.find((item) => item.startDate <= today && today <= item.endDate) ??
    sorted.filter((item) => item.startDate <= today).at(-1) ??
    sorted[0];
  if (!year) return null;
  return {
    ...year,
    daysLeft: daysBetween(today, year.endDate),
    hasNextYear: sorted.some((item) => item.startDate > year.startDate),
  };
}
