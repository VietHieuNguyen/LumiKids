/** Display helpers for the classroom screens (pure: covered by the web tests). */

export const genderLabels = { MALE: "Nam", FEMALE: "Nữ" } as const;
export const childStatusLabels = { ACTIVE: "Đang hoạt động", DISABLED: "Đã khóa" } as const;
export const classroomStatusLabels = { ACTIVE: "Đang học", ARCHIVED: "Đã lưu trữ" } as const;
export const playStatusLabels = { IN_PROGRESS: "Đang chơi", COMPLETED: "Hoàn thành", ABANDONED: "Bỏ dở" } as const;

/** "2021-05-01" → "01/05/2021", without going through a time zone. */
export function formatDateOnly(value: string): string {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

/** An ISO instant in the school's local time: "16/11/2026 08:05". */
export function formatDateTime(value: string, timeZone = "Asia/Ho_Chi_Minh"): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/** Whole years between a birthday ("YYYY-MM-DD") and today ("YYYY-MM-DD"). */
export function ageInYears(dob: string, today: string): number | null {
  const birth = dob.split("-").map(Number);
  const now = today.split("-").map(Number);
  if (birth.length !== 3 || now.length !== 3 || [...birth, ...now].some(Number.isNaN)) return null;
  const [by, bm, bd] = birth as [number, number, number];
  const [ny, nm, nd] = now as [number, number, number];
  return ny - by - (nm < bm || (nm === bm && nd < bd) ? 1 : 0);
}

/** An ISO instant as a local calendar date: "16/11/2026". */
export function formatDate(value: string, timeZone = "Asia/Ho_Chi_Minh"): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", { timeZone, day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

/** "8 phút 5 giây" between two ISO instants; null while the session is still open. */
export function formatDuration(startedAt: string, endedAt: string | null): string | null {
  if (!endedAt) return null;
  const seconds = Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 1000));
  if (Number.isNaN(seconds)) return null;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes >= 60) return `${Math.floor(minutes / 60)} giờ ${minutes % 60} phút`;
  return minutes ? `${minutes} phút ${rest} giây` : `${rest} giây`;
}

/** Local calendar date "YYYY-MM-DD" for date inputs and age computation. */
export function localToday(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
