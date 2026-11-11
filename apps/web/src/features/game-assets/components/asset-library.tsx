"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { GameAssetApiError, assetErrorMessage } from "../api";
import type { GameAssetsApi } from "../api";
import {
  assetSearchParams,
  changeAssetPage,
  DEFAULT_FILTERS,
} from "../metadata";
import type {
  AssetFilters as Filters,
  AssetPage,
  GameAsset,
  AssetStatus,
} from "../types";
import { AssetCard } from "./asset-card";
import { AssetDetail } from "./asset-detail";
import { AssetFilters } from "./asset-filters";
import { AssetForm } from "./asset-form";
import { AssetStatusDialog } from "./asset-status-dialog";

type Overlay =
  | { kind: "upload" }
  | { kind: "detail"; id: string }
  | { kind: "edit"; asset: GameAsset }
  | { kind: "status"; asset: GameAsset; returnTo: "detail" | "library" }
  | null;

export function AssetLibrary({
  client,
  fullName,
  onSignIn,
}: {
  client: GameAssetsApi;
  fullName: string;
  onSignIn: () => void;
}) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [filterKey, setFilterKey] = useState(0);
  const [result, setResult] = useState<AssetPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [accessStatus, setAccessStatus] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [notice, setNotice] = useState("");
  const [highlightedId, setHighlightedId] = useState("");
  const onAccessError = useCallback((failure: unknown) => {
    if (
      failure instanceof GameAssetApiError &&
      [401, 403].includes(failure.status)
    )
      setAccessStatus(failure.status);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    // Deferring also prevents duplicate requests during StrictMode's initial setup/cleanup.
    queueMicrotask(() => {
      if (!active) return;
      setLoading(true);
      setError("");
      client
        .list(assetSearchParams(filters), controller.signal)
        .then((data) => {
          if (!active) return;
          if (filters.page > Math.max(data.pagination.totalPages, 1)) {
            setFilters((current) =>
              changeAssetPage(current, Math.max(data.pagination.totalPages, 1)),
            );
            return;
          }
          setResult(data);
        })
        .catch((failure: unknown) => {
          if (active) {
            setError(assetErrorMessage(failure));
            onAccessError(failure);
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [client, filters, revision, onAccessError]);

  function apply(next: Filters) {
    if (JSON.stringify(next) === JSON.stringify(filters)) return;
    setLoading(true);
    setFilters(next);
    setHighlightedId("");
  }
  function changeStatusFilter(status: AssetStatus) {
    if (status === filters.status) return;
    apply({ ...filters, status, page: 1 });
    setFilterKey((value) => value + 1);
  }
  function saved(asset: GameAsset, uploaded: boolean) {
    setNotice(
      uploaded
        ? `Đã thêm “${asset.name}” vào thư viện.`
        : `Đã lưu thông tin “${asset.name}”.`,
    );
    setHighlightedId(asset.id);
    setLoading(true);
    if (uploaded) {
      setFilters({ ...DEFAULT_FILTERS });
      setFilterKey((value) => value + 1);
      setOverlay(null);
    } else setOverlay({ kind: "detail", id: asset.id });
    setRevision((value) => value + 1);
  }
  const filtered = !!(
    filters.search ||
    filters.objectType ||
    filters.tags.length
  );
  const pagination = result?.pagination;

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link
            href="/account"
            className="flex items-center gap-2 text-xl font-bold tracking-tight text-blue-700"
          >
            <span
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-700 text-base text-white"
            >
              L
            </span>
            LumiKids
            <span
              aria-hidden="true"
              className="mb-3 h-1.5 w-1.5 rounded-full bg-amber-400"
            />
          </Link>
          <Link
            href="/account"
            className="flex min-w-0 items-center gap-2 text-sm text-slate-600"
          >
            <span
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 font-semibold text-blue-700"
            >
              {fullName.charAt(0).toUpperCase()}
            </span>
            <span className="hidden max-w-52 truncate sm:block">
              {fullName}
            </span>
            <span className="sr-only">Tài khoản</span>
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-blue-600">
              KHÔNG GIAN QUẢN TRỊ
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Game Asset Library
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
              Thư viện hình ảnh dùng chung cho trò đếm, ghép cặp và phân loại.
              Thêm tên gọi và đặc điểm để tìm đúng học liệu từ mô tả của giáo
              viên.
            </p>
          </div>
          {!accessStatus && (
            <button
              type="button"
              className="asset-button-primary shadow-sm"
              onClick={() => setOverlay({ kind: "upload" })}
            >
              <span aria-hidden="true" className="text-lg leading-none">
                ＋
              </span>{" "}
              Thêm hình ảnh
            </button>
          )}
        </div>
        {accessStatus ? (
          <section
            className="rounded-2xl border border-slate-200 bg-white p-8"
            aria-labelledby="asset-access-heading"
          >
            <h2 id="asset-access-heading" className="text-lg font-semibold">
              {accessStatus === 401
                ? "Vui lòng đăng nhập lại"
                : "Bạn chưa có quyền quản lý thư viện"}
            </h2>
            <p role="alert" className="mt-3 text-sm leading-6 text-slate-600">
              {accessStatus === 401
                ? "Phiên hiện tại không được hệ thống chấp nhận. Hãy đăng nhập lại để tiếp tục."
                : "Quyền tài khoản có thể đã thay đổi. Hãy liên hệ quản trị viên để được cấp quyền phù hợp."}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              {accessStatus === 401 && (
                <button
                  type="button"
                  className="asset-button-primary"
                  onClick={onSignIn}
                >
                  Đăng nhập lại
                </button>
              )}
              <Link className="asset-button-secondary" href="/account">
                Về tài khoản
              </Link>
            </div>
          </section>
        ) : (
          <>
            {notice && (
              <div
                role="status"
                className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800"
              >
                <span>{notice}</span>
                <button
                  type="button"
                  className="shrink-0 rounded px-1"
                  aria-label="Ẩn thông báo"
                  onClick={() => setNotice("")}
                >
                  ✕
                </button>
              </div>
            )}
            <AssetFilters key={filterKey} filters={filters} onApply={apply} />
            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
              <div
                role="group"
                aria-label="Lọc theo trạng thái học liệu"
                className="grid gap-2 sm:grid-cols-2"
              >
                {(
                  [
                    ["ACTIVE", "Đang sử dụng", "Được chọn để tạo trò chơi mới"],
                    [
                      "INACTIVE",
                      "Ngừng sử dụng",
                      "Giữ lại học liệu, có thể kích hoạt lại",
                    ],
                  ] satisfies [AssetStatus, string, string][]
                ).map(([status, label, description]) => (
                  <button
                    key={status}
                    type="button"
                    aria-pressed={filters.status === status}
                    className={`min-h-16 rounded-xl border-2 px-4 py-3 text-left ${filters.status === status ? (status === "ACTIVE" ? "border-emerald-500 bg-emerald-50 text-emerald-900" : "border-slate-500 bg-slate-100 text-slate-900") : "border-transparent bg-slate-50 text-slate-600 hover:border-slate-200"}`}
                    onClick={() => changeStatusFilter(status)}
                  >
                    <span className="block text-sm font-semibold">
                      {status} · {label}
                    </span>
                    <span className="mt-1 block text-xs leading-5">
                      {description}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-4 mt-7 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-700">
                {filters.status === "ACTIVE"
                  ? "Học liệu đang sử dụng"
                  : "Học liệu ngừng sử dụng"}
                {!loading && !error && pagination && (
                  <span className="ml-2 rounded-full bg-slate-200/70 px-2 py-0.5 text-xs text-slate-600">
                    {pagination.total}
                  </span>
                )}
              </h2>
              <button
                type="button"
                disabled={loading}
                className="asset-text-button"
                onClick={() => {
                  setLoading(true);
                  setRevision((value) => value + 1);
                }}
              >
                ↻ Tải lại
              </button>
            </div>
            {loading ? (
              <div
                role="status"
                aria-label="Đang tải thư viện hình ảnh"
                className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
              >
                {Array.from({ length: 8 }, (_, index) => (
                  <div
                    key={index}
                    aria-hidden="true"
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
                  >
                    <div className="aspect-[4/3] animate-pulse bg-slate-200/70" />
                    <div className="space-y-3 p-4">
                      <div className="h-3 w-1/3 rounded bg-slate-100" />
                      <div className="h-4 w-3/4 rounded bg-slate-100" />
                      <div className="h-9 rounded bg-slate-100" />
                    </div>
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="rounded-2xl border border-red-100 bg-white p-8 text-center">
                <p role="alert" className="text-sm text-red-700">
                  {error}
                </p>
                <button
                  type="button"
                  className="asset-button-secondary mt-5"
                  onClick={() => {
                    setLoading(true);
                    setRevision((value) => value + 1);
                  }}
                >
                  Thử lại
                </button>
              </div>
            ) : result?.items.length ? (
              <>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {result.items.map((asset) => (
                    <AssetCard
                      key={asset.id}
                      asset={asset}
                      client={client}
                      highlighted={asset.id === highlightedId}
                      onAccessError={onAccessError}
                      onDetail={() =>
                        setOverlay({ kind: "detail", id: asset.id })
                      }
                      onStatus={() =>
                        setOverlay({
                          kind: "status",
                          asset,
                          returnTo: "library",
                        })
                      }
                    />
                  ))}
                </div>
                {pagination && (
                  <nav
                    aria-label="Phân trang thư viện hình ảnh"
                    className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 pt-5"
                  >
                    <p className="text-sm text-slate-500">
                      {(pagination.page - 1) * pagination.pageSize + 1}–
                      {(pagination.page - 1) * pagination.pageSize +
                        result.items.length}{" "}
                      trong {pagination.total} hình ảnh
                    </p>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        className="asset-button-secondary"
                        disabled={pagination.page <= 1}
                        onClick={() =>
                          apply(changeAssetPage(filters, filters.page - 1))
                        }
                      >
                        ← Trước
                      </button>
                      <span
                        aria-live="polite"
                        className="text-sm text-slate-600"
                      >
                        Trang {pagination.page} / {pagination.totalPages}
                      </span>
                      <button
                        type="button"
                        className="asset-button-secondary"
                        disabled={
                          pagination.page >=
                          Math.min(pagination.totalPages, 10000)
                        }
                        onClick={() =>
                          apply(changeAssetPage(filters, filters.page + 1))
                        }
                      >
                        Sau →
                      </button>
                    </div>
                  </nav>
                )}
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
                <span
                  aria-hidden="true"
                  className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-3xl text-blue-500"
                >
                  ▧
                </span>
                <h2 className="mt-5 text-lg font-semibold">
                  {filtered
                    ? "Không tìm thấy hình ảnh phù hợp"
                    : filters.status === "INACTIVE"
                      ? "Chưa có hình ảnh ngừng sử dụng"
                      : "Thư viện đang chờ hình ảnh đầu tiên"}
                </h2>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                  {filtered
                    ? "Thử đổi từ khóa, loại đối tượng hoặc tags để tìm lại."
                    : "Thêm hình ảnh và mô tả để chuẩn bị học liệu cho các trò chơi."}
                </p>
                {filtered ? (
                  <button
                    type="button"
                    className="asset-button-secondary mt-6"
                    onClick={() => {
                      setFilterKey((value) => value + 1);
                      apply({ ...DEFAULT_FILTERS });
                    }}
                  >
                    Xóa bộ lọc
                  </button>
                ) : (
                  <button
                    type="button"
                    className="asset-button-primary mt-6"
                    onClick={() => setOverlay({ kind: "upload" })}
                  >
                    ＋ Thêm hình ảnh
                  </button>
                )}
              </div>
            )}
            {overlay?.kind === "upload" && (
              <AssetForm
                client={client}
                onClose={() => setOverlay(null)}
                onSaved={saved}
                onAccessError={onAccessError}
              />
            )}
            {overlay?.kind === "detail" && (
              <AssetDetail
                client={client}
                id={overlay.id}
                onClose={() => setOverlay(null)}
                onEdit={(asset) => setOverlay({ kind: "edit", asset })}
                onStatus={(asset) =>
                  setOverlay({ kind: "status", asset, returnTo: "detail" })
                }
                onAccessError={onAccessError}
              />
            )}
            {overlay?.kind === "edit" && (
              <AssetForm
                key={overlay.asset.id}
                client={client}
                asset={overlay.asset}
                onClose={() =>
                  setOverlay({ kind: "detail", id: overlay.asset.id })
                }
                onSaved={saved}
                onAccessError={onAccessError}
              />
            )}
            {overlay?.kind === "status" && (
              <AssetStatusDialog
                key={`${overlay.asset.id}:${overlay.asset.status}`}
                client={client}
                asset={overlay.asset}
                onClose={() =>
                  setOverlay(
                    overlay.returnTo === "detail"
                      ? { kind: "detail", id: overlay.asset.id }
                      : null,
                  )
                }
                onAccessError={onAccessError}
                onSaved={(asset) => {
                  setNotice(
                    asset.status === "ACTIVE"
                      ? `Đã chuyển “${asset.name}” sang ACTIVE. Học liệu có thể được chọn để tạo trò chơi.`
                      : `Đã chuyển “${asset.name}” sang INACTIVE. Học liệu nằm trong danh sách ngừng sử dụng và có thể kích hoạt lại.`,
                  );
                  setHighlightedId(asset.id);
                  setOverlay(
                    overlay.returnTo === "detail"
                      ? { kind: "detail", id: asset.id }
                      : null,
                  );
                  setLoading(true);
                  setRevision((value) => value + 1);
                }}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
