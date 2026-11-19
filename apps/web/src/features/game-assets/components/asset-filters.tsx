"use client";

import { useId, useState } from "react";
import type { FormEvent } from "react";
import { prepareFilters, OBJECT_TYPES } from "../metadata";
import type { AssetFilters as Filters, AssetStatus } from "../types";
import { AssetIcon as Icon } from "./asset-icon";

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
      className="rounded-3xl border border-line bg-paper p-4 shadow-sm sm:p-5"
      onSubmit={apply}
      aria-label="Tìm kiếm và lọc thư viện hình ảnh"
    >
      <div className="mb-4 flex items-center gap-2">
        <Icon name="search" className="h-4 w-4 text-leaf" />
        <h2 className="text-sm font-bold">Tìm hình ảnh phù hợp</h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
        <label className="block">
          <span className="asset-label" id={`${id}-search-label`}>Tìm theo tên</span>
          <input
            aria-labelledby={`${id}-search-label`}
            type="search"
            className="asset-input mt-2"
            value={search}
            maxLength={200}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tìm hình ảnh…"
          />
        </label>
        <label className="block">
          <span className="asset-label" id={`${id}-type-label`}>Loại đối tượng</span>
          <input
            aria-labelledby={`${id}-type-label`}
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
          <span className="asset-label" id={`${id}-status-label`}>Trạng thái</span>
          <select
            aria-labelledby={`${id}-status-label`}
            className="asset-input mt-2"
            value={status}
            onChange={(event) => setStatus(event.target.value as AssetStatus)}
          >
            <option value="ACTIVE">Đang sử dụng</option>
            <option value="INACTIVE">Ngừng sử dụng</option>
          </select>
        </label>
        <label className="block">
          <span className="asset-label" id={`${id}-tags-label`}>Từ khóa</span>
          <input
            aria-labelledby={`${id}-tags-label`}
            className="asset-input mt-2"
            value={tags}
            maxLength={1600}
            onChange={(event) => setTags(event.target.value)}
            placeholder="Ví dụ: đỏ, bóng"
          />
        </label>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-4">
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          Số ảnh mỗi trang
          <select
            className="min-h-11 rounded-xl border border-line bg-white px-3 text-sm text-ink focus:border-leaf"
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
          <button type="submit" className="asset-button-primary">
            <Icon name="search" className="h-4 w-4" />Áp dụng bộ lọc
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-berry">
          {error}
        </p>
      )}
    </form>
  );
}
