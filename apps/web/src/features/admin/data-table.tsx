"use client";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { PAGE_SIZE, PAGE_SIZES, pageNumbers } from "./list-helpers";
import type { SortDir } from "./list-helpers";

export { PAGE_SIZE, PAGE_SIZES, pageSizeOf, compareName, compareText, pageOf, sortRows, textMatches, toParams } from "./list-helpers";
export type { SortDir } from "./list-helpers";

/**
 * Building blocks for the admin list screens (classes, children, teachers, guardians): list state kept in
 * the address bar so a filtered view can be shared or reloaded, sortable headers, paging, labelled filters
 * and a selection that can span pages.
 */

export type ListState = Record<string, string>;

/** Reads `defaults`' keys from the query string once, and writes changes back (defaults are left out). */
export function useListState<T extends ListState>(defaults: T) {
  const params = useSearchParams();
  const [state, setState] = useState<T>(() => {
    const read = { ...defaults };
    for (const key of Object.keys(defaults) as (keyof T & string)[]) {
      const value = params.get(key);
      if (value !== null) read[key] = value as T[typeof key];
    }
    return read;
  });

  useEffect(() => {
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries(state)) {
      if (value === defaults[key]) url.searchParams.delete(key);
      else url.searchParams.set(key, value);
    }
    const next = url.pathname + url.search + url.hash;
    if (next !== window.location.pathname + window.location.search + window.location.hash) window.history.replaceState(window.history.state, "", next);
    // `defaults` is a fresh literal each render; its values never change for a screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  /** Any change other than the page itself starts again at page 1. */
  function update(patch: Partial<T>) {
    setState((current) => ({ ...current, ...patch, ...("page" in defaults && !("page" in patch) ? { page: "1" } : {}) }));
  }
  function reset() {
    setState(defaults);
  }
  const changed = (Object.keys(defaults) as (keyof T & string)[]).filter((key) => !["page", "size", "sort", "dir"].includes(key) && state[key] !== defaults[key]).length;
  return { state, update, reset, changed };
}

// ---------- Sorting ----------

export function SortHeader({
  label,
  field,
  sort,
  dir,
  onSort,
  align = "left",
  className = "",
}: {
  label: string;
  field: string;
  sort: string;
  dir: SortDir;
  onSort: (field: string, dir: SortDir) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active = sort === field;
  const next: SortDir = active && dir === "asc" ? "desc" : "asc";
  return (
    <th scope="col" aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"} className={`px-3 py-2 font-medium ${align === "right" ? "text-right" : ""} ${className}`}>
      <button
        type="button"
        onClick={() => onSort(field, next)}
        className={`-mx-1.5 inline-flex min-h-8 items-center gap-1 rounded px-1.5 transition-colors hover:bg-leaf-soft hover:text-ink ${active ? "text-ink" : ""} ${align === "right" ? "flex-row-reverse" : ""}`}
      >
        {label}
        <svg width="10" height="12" viewBox="0 0 10 12" aria-hidden="true" className={active ? "opacity-100" : "opacity-35"}>
          <path d="M5 1 8.5 4.5h-7Z" fill="currentColor" opacity={active && dir === "desc" ? 0.3 : 1} />
          <path d="M5 11 1.5 7.5h7Z" fill="currentColor" opacity={active && dir === "asc" ? 0.3 : 1} />
        </svg>
        <span className="sr-only">{active ? (dir === "asc" ? ", đang xếp tăng dần" : ", đang xếp giảm dần") : ", bấm để sắp xếp"}</span>
      </button>
    </th>
  );
}

/** For phones, where the table becomes cards: one labelled select instead of the column headers. */
export function SortSelect({
  id,
  options,
  sort,
  dir,
  onSort,
}: {
  id: string;
  options: readonly { field: string; label: string }[];
  sort: string;
  dir: SortDir;
  onSort: (field: string, dir: SortDir) => void;
}) {
  return (
    <div className="min-w-0 md:hidden">
      <label className="block text-xs font-medium text-ink-soft" htmlFor={id}>Sắp xếp</label>
      <select
        id={id}
        className="asset-input mt-1"
        value={`${sort}:${dir}`}
        onChange={(event) => {
          const [field, order] = event.target.value.split(":");
          onSort(field, order === "desc" ? "desc" : "asc");
        }}
      >
        {options.flatMap((option) => [
          <option key={`${option.field}:asc`} value={`${option.field}:asc`}>{option.label} (tăng dần)</option>,
          <option key={`${option.field}:desc`} value={`${option.field}:desc`}>{option.label} (giảm dần)</option>,
        ])}
      </select>
    </div>
  );
}

// ---------- Filters ----------

export function FilterSelect<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: T;
  options: readonly { value: T; label: string; count?: number }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="min-w-0">
      <label className="block text-xs font-medium text-ink-soft" htmlFor={id}>{label}</label>
      <select id={id} className={`asset-input mt-1 w-full sm:w-auto sm:min-w-40 ${value !== options[0]?.value ? "!border-ink/40 font-medium" : ""}`} value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}{option.count === undefined ? "" : ` (${option.count})`}
          </option>
        ))}
      </select>
    </div>
  );
}

/** "12 / 40 trẻ" and, when anything is filtered, a way back to the whole list. */
export function ResultCount({ shown, total, noun, changed, onReset }: { shown: number; total: number; noun: string; changed: number; onReset: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-soft">
      <p role="status" aria-live="polite">
        {shown === total ? `${total} ${noun}` : `${shown} / ${total} ${noun}`}
      </p>
      {changed > 0 && (
        <button type="button" className="inline-flex min-h-8 items-center font-medium text-ink underline-offset-4 hover:underline" onClick={onReset}>
          Xóa {changed} bộ lọc
        </button>
      )}
    </div>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  // Phones: two columns with the search box (first child) across both; wider screens: one wrapping row.
  return <div className="mb-3 grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap [&>*:first-child]:col-span-2 [&>*]:min-w-0">{children}</div>;
}

export function EmptyState({ filtered, title, hint, onReset }: { filtered: boolean; title: string; hint: string; onReset: () => void }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-4 py-10 text-center">
      <p className="text-sm font-semibold">{filtered ? "Không có kết quả phù hợp" : title}</p>
      <p className="mt-1 text-sm text-ink-soft">{filtered ? "Thử từ khóa khác hoặc bỏ bớt bộ lọc." : hint}</p>
      {filtered && <button type="button" className="asset-button-secondary mt-4" onClick={onReset}>Xóa bộ lọc</button>}
    </div>
  );
}

// ---------- Paging ----------

/**
 * Always shown once there are rows, so the reader knows where they are: the range, page buttons and the
 * page size. Changing the size starts again at page 1.
 */
export function Pagination({
  page,
  pages,
  total,
  size = PAGE_SIZE,
  onPage,
  onSize,
}: {
  page: number;
  pages: number;
  total: number;
  size?: number;
  onPage: (page: number) => void;
  onSize?: (size: number) => void;
}) {
  if (total === 0) return null;
  const from = (page - 1) * size + 1;
  const to = Math.min(total, page * size);
  const button = "inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-2 tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <nav aria-label="Phân trang" className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3 text-[13px]">
      <div className="flex flex-wrap items-center gap-3 text-ink-soft">
        <p className="tabular-nums">
          Hiển thị <span className="font-medium text-ink">{from}–{to}</span> trong <span className="font-medium text-ink">{total}</span>
        </p>
        {onSize && (
          <label className="flex items-center gap-2">
            <span>Mỗi trang</span>
            <select className="asset-input !h-9 !min-h-9 w-auto !py-0" value={size} onChange={(event) => onSize(Number(event.target.value))}>
              {PAGE_SIZES.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button type="button" className={`${button} border-line bg-paper hover:bg-leaf-soft`} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Trang trước">‹</button>
        {pageNumbers(page, pages).map((item, index) =>
          item === "gap" ? (
            <span key={`gap-${index}`} aria-hidden="true" className="px-1 text-ink-soft">…</span>
          ) : (
            <button
              key={item}
              type="button"
              aria-label={`Trang ${item}`}
              aria-current={item === page ? "page" : undefined}
              className={`${button} ${item === page ? "border-ink bg-ink font-semibold text-paper" : "border-line bg-paper hover:bg-leaf-soft"}`}
              onClick={() => item !== page && onPage(item)}
            >
              {item}
            </button>
          ),
        )}
        <button type="button" className={`${button} border-line bg-paper hover:bg-leaf-soft`} disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Trang sau">›</button>
      </div>
    </nav>
  );
}

// ---------- Selection across pages ----------

/** What the selection bar needs, whichever list (in memory or paged on the server) it serves. */
export interface SelectionView {
  count: number;
  matchingCount: number;
  allMatching: boolean;
  selectAllMatching: () => void;
  clear: () => void;
  busy?: boolean;
  /** Set when "select all" stopped at the server's cap. */
  note?: string;
}

/**
 * In-memory lists. `pageIds` are the rows on screen, `matchingIds` every row that passes the filters; ids
 * that stop matching (filtered out, deleted on reload) drop out of the selection.
 */
export function useCrossPageSelection(pageIds: readonly string[], matchingIds: readonly string[]) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const matching = new Set(matchingIds);
  const selected = [...picked].filter((id) => matching.has(id));
  const chosen = new Set(selected);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => chosen.has(id));
  const someOnPage = !allOnPage && pageIds.some((id) => chosen.has(id));
  return {
    selected,
    count: selected.length,
    has: (id: string) => chosen.has(id),
    toggle: (id: string) =>
      setPicked((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    togglePage: () =>
      setPicked((current) => {
        const next = new Set(current);
        for (const id of pageIds) {
          if (allOnPage) next.delete(id);
          else next.add(id);
        }
        return next;
      }),
    selectAllMatching: () => setPicked(new Set(matchingIds)),
    clear: () => setPicked(new Set()),
    allOnPage,
    someOnPage,
    allMatching: selected.length > 0 && selected.length === matchingIds.length,
    matchingCount: matchingIds.length,
  };
}

/**
 * Lists paged on the server: the picks themselves are kept (with what a batch preview needs), so a
 * selection survives paging. Changing the filters (`resetKey`) clears it; "select all" asks the server.
 */
export function useServerSelection<P>({
  idOf,
  pageRows,
  total,
  resetKey,
  loadAll,
}: {
  idOf: (pick: P) => string;
  pageRows: readonly P[];
  total: number;
  resetKey: string;
  loadAll: () => Promise<{ items: P[]; truncated: boolean }>;
}) {
  const [state, setState] = useState<{ key: string; picked: ReadonlyMap<string, P>; truncated: boolean }>({ key: resetKey, picked: new Map(), truncated: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Filters changed: the old picks may no longer match, so start over (render-time reset, no extra effect).
  const current = state.key === resetKey ? state : { key: resetKey, picked: new Map<string, P>(), truncated: false };
  if (current !== state) setState(current);
  const picked = current.picked;
  const pageIds = pageRows.map(idOf);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => picked.has(id));
  const someOnPage = !allOnPage && pageIds.some((id) => picked.has(id));
  const update = (change: (next: Map<string, P>) => void) =>
    setState((previous) => {
      const next = new Map(previous.key === resetKey ? previous.picked : []);
      change(next);
      return { key: resetKey, picked: next, truncated: false };
    });
  return {
    selected: [...picked.values()],
    selectedIds: [...picked.keys()],
    count: picked.size,
    has: (id: string) => picked.has(id),
    toggle: (row: P) =>
      update((next) => {
        const id = idOf(row);
        if (next.has(id)) next.delete(id);
        else next.set(id, row);
      }),
    togglePage: () =>
      update((next) => {
        for (const row of pageRows) {
          if (allOnPage) next.delete(idOf(row));
          else next.set(idOf(row), row);
        }
      }),
    selectAllMatching: () => {
      if (busy) return;
      setBusy(true);
      setError("");
      loadAll()
        .then(({ items, truncated }) => setState({ key: resetKey, picked: new Map(items.map((item) => [idOf(item), item])), truncated }))
        .catch(() => setError("Chưa chọn được toàn bộ danh sách. Thử lại sau."))
        .finally(() => setBusy(false));
    },
    clear: () => setState({ key: resetKey, picked: new Map(), truncated: false }),
    allOnPage,
    someOnPage,
    allMatching: picked.size > 0 && picked.size >= total,
    matchingCount: total,
    busy,
    note: error || (current.truncated ? `Đã chọn ${picked.size} mục đầu tiên (giới hạn mỗi lần).` : undefined),
  };
}

/** Waits until typing pauses before the value is used for a request. */
export function useDebounced<T>(value: T, delay = 300) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

export function SelectBox({ checked, mixed = false, label, onChange, disabled = false }: { checked: boolean; mixed?: boolean; label: string; onChange: () => void; disabled?: boolean }) {
  return (
    // The 44px label is the hit area; the box stays small.
    <label className="-m-3 inline-flex size-11 cursor-pointer items-center justify-center">
      <input
        type="checkbox"
        className="size-4 cursor-pointer accent-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-40"
        checked={checked}
        ref={(node) => {
          if (node) node.indeterminate = mixed;
        }}
        onChange={onChange}
        disabled={disabled}
        aria-label={label}
      />
    </label>
  );
}

/** Shown while rows are selected: the count, the screen's actions and the "select every match" offer. */
export function SelectionBar({ selection, noun, children }: { selection: SelectionView; noun: string; children: ReactNode }) {
  if (selection.count === 0) return null;
  return (
    <div role="region" aria-label={`Thao tác với ${noun} đã chọn`} className="sticky top-2 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-ink/15 bg-cream px-3 py-2 shadow-[0_6px_16px_-12px_rgb(24_56_41/40%)]">
      <p className="mr-1 text-sm font-semibold tabular-nums" aria-live="polite">Đã chọn {selection.count} {noun}</p>
      {!selection.allMatching && selection.matchingCount > selection.count && (
        <button type="button" disabled={selection.busy} className="inline-flex min-h-8 items-center text-sm font-medium text-leaf underline-offset-4 hover:underline disabled:opacity-60" onClick={selection.selectAllMatching}>
          {selection.busy ? "Đang chọn…" : `Chọn cả ${selection.matchingCount} ${noun} phù hợp`}
        </button>
      )}
      {selection.note && <p className="text-[13px] text-ink-soft">{selection.note}</p>}
      <div className="flex flex-wrap gap-2 sm:ml-auto">
        {children}
        <button type="button" className="asset-button-secondary" onClick={selection.clear}>Bỏ chọn</button>
      </div>
    </div>
  );
}
