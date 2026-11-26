"use client";
import { useId } from "react";
import type { ChildProfile } from "@lumikids/shared";
import { childMatches } from "./classroom-workflow";
import type { RosterFilter } from "./classroom-workflow";
import { useNavigationMemory } from "./navigation-memory";

const directoryFilters = new Map<string, { query: string; filter: RosterFilter }>();

export function useRoster<T extends ChildProfile>(children: T[], memoryKey?: string) {
  const memory = useNavigationMemory(directoryFilters, memoryKey, () => ({ query: "", filter: "all" as const }));
  const { query, filter } = memory.value;
  const setQuery = (value: string) => memory.update((previous) => ({ ...previous, query: value }));
  const setFilter = (value: RosterFilter) => memory.update((previous) => ({ ...previous, filter: value }));
  return {
    query, setQuery, filter, setFilter,
    children: children.filter((child) => childMatches(child, query, filter)),
  };
}

export function RosterTools({
  query, setQuery, filter, setFilter, count,
}: {
  query: string;
  setQuery: (query: string) => void;
  filter?: RosterFilter;
  setFilter?: (filter: RosterFilter) => void;
  count: number;
}) {
  const id = useId();
  return (
    <div className="mb-3 border-b border-line pb-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 grow basis-52">
          <label className="asset-label" htmlFor={id}>Tìm tên trẻ</label>
          <input id={id} type="search" value={query} onChange={(event) => setQuery(event.target.value)} className="asset-input mt-1" placeholder="Nhập họ hoặc tên" />
        </div>
        {setFilter && (
          <div className="min-w-0 grow sm:grow-0">
            <label className="asset-label" htmlFor={`${id}-status`}>Trạng thái</label>
            <select id={`${id}-status`} className="asset-input mt-1" value={filter} onChange={(event) => setFilter(event.target.value as RosterFilter)}>
              <option value="all">Tất cả</option>
              <option value="missing-code">Chưa có mã</option>
              <option value="disabled">Đã khóa</option>
            </select>
          </div>
        )}
      </div>
      <p role="status" className="mt-2 text-sm text-ink-soft">{count} trẻ hiển thị</p>
    </div>
  );
}
