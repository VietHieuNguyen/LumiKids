"use client";

import { useId, useState } from "react";
import type { FormEvent } from "react";
import { prepareFilters, OBJECT_TYPES } from "../metadata";
import type { AssetFilters as Filters, AssetStatus } from "../types";

export function AssetFilters({
  filters,
  onApply,
}: {
  filters: Filters;
  onApply: (filters: Filters) => void;
}) {
  const id = useId();
  const [search, setSearch] = useState(filters.search);
  const [objectType, setObjectType] = useState(filters.objectType);
  const [status, setStatus] = useState<AssetStatus>(filters.status);
  const [tags, setTags] = useState(filters.tags.join(", "));
  const [pageSize, setPageSize] = useState(filters.pageSize);
  const [error, setError] = useState("");
  function apply(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      onApply(prepareFilters({ search, objectType, status, tags, pageSize }));
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Vui lòng kiểm tra bộ lọc.",
      );
    }
  }
  return (
    <form
      className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"
      onSubmit={apply}
      aria-label="Tìm kiếm và lọc thư viện hình ảnh"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(12rem,1.6fr)_1fr_1fr_1.2fr]">
        <label className="block">
          <span className="asset-label text-xs">Tìm theo tên</span>
          <input
            type="search"
            className="asset-input mt-2"
            value={search}
            maxLength={200}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tìm hình ảnh…"
          />
        </label>
        <label className="block">
          <span className="asset-label text-xs">Loại đối tượng</span>
          <input
            className="asset-input mt-2"
            list={`${id}-types`}
            value={objectType}
            maxLength={40}
            pattern="[A-Z][A-Z0-9_]{0,39}"
            onChange={(event) =>
              setObjectType(event.target.value.toUpperCase())
            }
            placeholder="Tất cả loại"
          />
          <datalist id={`${id}-types`}>
            {OBJECT_TYPES.map((type) => (
              <option key={type} value={type} />
            ))}
          </datalist>
        </label>
        <label className="block">
          <span className="asset-label text-xs">Trạng thái</span>
          <select
            className="asset-input mt-2"
            value={status}
            onChange={(event) => setStatus(event.target.value as AssetStatus)}
          >
            <option value="ACTIVE">ACTIVE · Đang sử dụng</option>
            <option value="INACTIVE">INACTIVE · Ngừng sử dụng</option>
          </select>
        </label>
        <label className="block">
          <span className="asset-label text-xs">Tags</span>
          <input
            className="asset-input mt-2"
            value={tags}
            maxLength={1600}
            onChange={(event) => setTags(event.target.value)}
            placeholder="red, ball"
          />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs text-slate-500">
          Số ảnh mỗi trang
          <select
            className="min-h-9 rounded-lg border border-slate-200 bg-white px-2 text-slate-700"
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value))}
          >
            <option value={12}>12</option>
            <option value={20}>20</option>
            <option value={40}>40</option>
          </select>
        </label>
        <div className="flex gap-3">
          <button
            type="button"
            className="asset-text-button"
            onClick={() => {
              setSearch("");
              setObjectType("");
              setStatus("ACTIVE");
              setTags("");
              setPageSize(20);
              setError("");
              onApply(
                prepareFilters({
                  search: "",
                  objectType: "",
                  status: "ACTIVE",
                  tags: "",
                  pageSize: 20,
                }),
              );
            }}
          >
            Đặt lại
          </button>
          <button type="submit" className="asset-button-secondary">
            Áp dụng bộ lọc
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}
