/** Pure list helpers (no React), shared by the admin list screens and their tests. */

export type SortDir = "asc" | "desc";

const collator = new Intl.Collator("vi", { sensitivity: "base", numeric: true });
export const compareText = (a: string, b: string) => collator.compare(a, b);

/** Vietnamese names sort by the given name (last word), then the full name. */
export function compareName(a: string, b: string) {
  const given = (name: string) => name.trim().split(/\s+/).pop() ?? "";
  return compareText(given(a), given(b)) || compareText(a, b);
}

export function sortRows<T>(rows: readonly T[], compare: (a: T, b: T) => number, dir: SortDir) {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => sign * compare(a, b));
}

/** Accent- and case-insensitive word match ("ng an" finds "Nguyễn An"). */
export function textMatches(query: string, ...values: (string | null | undefined)[]) {
  const fold = (value: string) => value.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replaceAll("đ", "d");
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = fold(values.filter(Boolean).join(" "));
  return words.every((word) => haystack.includes(word));
}

export const PAGE_SIZE = 25;
export const PAGE_SIZES = [10, 25, 50, 100] as const;

/** A page size from the address bar; anything unexpected falls back to the default. */
export function pageSizeOf(value: string | undefined) {
  const size = Number(value);
  return (PAGE_SIZES as readonly number[]).includes(size) ? size : PAGE_SIZE;
}

/** Page buttons to show: first, last and two either side of the current one, with gaps between. */
export function pageNumbers(page: number, pages: number): (number | "gap")[] {
  const wanted = new Set([1, pages, page - 2, page - 1, page, page + 1, page + 2].filter((n) => n >= 1 && n <= pages));
  const sorted = [...wanted].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  for (const n of sorted) {
    const last = out[out.length - 1];
    if (typeof last === "number" && n - last === 2) out.push(last + 1);
    else if (typeof last === "number" && n - last > 2) out.push("gap");
    out.push(n);
  }
  return out;
}

export function pageOf<T>(rows: readonly T[], page: number, size = PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(Math.max(1, page), pages);
  return { rows: rows.slice((current - 1) * size, current * size), page: current, pages };
}

/** Query string from list state, leaving out empty values. */
export function toParams(values: Record<string, string | number>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== "") params.set(key, String(value));
  return params;
}
