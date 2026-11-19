"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { StaffPage } from "@/components/staff-shell";
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
} from "../types";
import { AssetCard } from "./asset-card";
import { AssetDetail } from "./asset-detail";
import { AssetFilters } from "./asset-filters";
import { AssetForm } from "./asset-form";
import { AssetStatusDialog } from "./asset-status-dialog";
import { AssetIcon as Icon } from "./asset-icon";

type Overlay =
  | { kind: "upload" }
  | { kind: "detail"; id: string }
  | { kind: "edit"; asset: GameAsset }
  | { kind: "status"; asset: GameAsset; returnTo: "detail" | "library" }
  | null;

export function AssetLibrary({
  client,
  onSignIn,
}: {
  client: GameAssetsApi;
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
    <StaffPage>
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-7 sm:px-6 sm:pt-9">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-5">
          <div className="min-w-0">
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-leaf">
              Quản trị · Học liệu dùng chung
            </p>
            <h1 className="font-display text-4xl font-extrabold leading-tight text-ink">
              Thư viện hình ảnh
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-soft">
              Quản lý hình ảnh cho trò đếm, ghép cặp và phân loại của bé.
            </p>
          </div>
          {!accessStatus && (
            <button
              type="button"
              className="lumi-button-sun"
              onClick={() => setOverlay({ kind: "upload" })}
            >
              <Icon name="plus" />
              Thêm hình ảnh
            </button>
          )}
        </header>
        {accessStatus ? (
          <section
            className="rounded-2xl border border-line bg-paper p-8"
            aria-labelledby="asset-access-heading"
          >
            <h2 id="asset-access-heading" className="text-lg font-semibold">
              {accessStatus === 401
                ? "Vui lòng đăng nhập lại"
                : "Bạn chưa có quyền quản lý thư viện"}
            </h2>
            <p role="alert" className="mt-3 text-sm leading-6 text-ink-soft">
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
            <aside className="mb-6 flex items-center gap-3 rounded-2xl border border-leaf/15 bg-leaf-soft/60 px-5 py-4" aria-label="Thông tin thư viện hình ảnh">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-paper text-leaf"><Icon name="image" className="h-6 w-6" /></span>
              <div>
                <p className="font-display text-lg font-bold">Học liệu nhỏ, khám phá lớn</p>
                <p className="mt-0.5 text-xs leading-5 text-ink-soft">Thêm tên gọi, từ khóa và đặc điểm để giáo viên dễ tìm hình ảnh phù hợp.</p>
              </div>
            </aside>
            {notice && (
              <div
                role="status"
                className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-leaf/20 bg-leaf-soft px-4 py-3 text-sm leading-6 text-ink"
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
            <div className="mb-4 mt-7 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-2xl font-bold">
                {filters.status === "ACTIVE"
                  ? "Học liệu đang sử dụng"
                  : "Học liệu ngừng sử dụng"}
                {!loading && !error && pagination && (
                  <span className="ml-2 rounded-full bg-leaf-soft px-2.5 py-1 font-sans text-sm text-leaf">
                    {pagination.total}
                  </span>
                )}
              </h2>
              <button
                type="button"
                disabled={loading}
                className="asset-button-secondary"
                onClick={() => {
                  setLoading(true);
                  setRevision((value) => value + 1);
                }}
              >
                <Icon name="refresh" className="h-4 w-4" />Tải lại
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
                    className="overflow-hidden rounded-2xl border border-line bg-paper"
                  >
                    <div className="aspect-[4/3] animate-pulse bg-ink/10" />
                    <div className="space-y-3 p-4">
                      <div className="h-3 w-1/3 rounded bg-ink/5" />
                      <div className="h-4 w-3/4 rounded bg-ink/5" />
                      <div className="h-9 rounded bg-ink/5" />
                    </div>
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="rounded-2xl border border-berry/20 bg-paper p-8 text-center">
                <p role="alert" className="text-sm text-berry">
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
                    className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-5"
                  >
                    <p className="text-sm text-ink-soft">
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
                        className="text-sm text-ink-soft"
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
              <div className="rounded-2xl border border-dashed border-ink/20 bg-paper px-6 py-16 text-center">
                <span
                  aria-hidden="true"
                  className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-leaf-soft text-3xl text-leaf"
                >
                  <Icon name="image" className="h-7 w-7" />
                </span>
                <h2 className="mt-5 text-lg font-semibold">
                  {filtered
                    ? "Không tìm thấy hình ảnh phù hợp"
                    : filters.status === "INACTIVE"
                      ? "Chưa có hình ảnh ngừng sử dụng"
                      : "Thư viện đang chờ hình ảnh đầu tiên"}
                </h2>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-soft">
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
                    className="lumi-button-sun mt-6"
                    onClick={() => setOverlay({ kind: "upload" })}
                  >
                    <Icon name="plus" className="h-4 w-4" />Thêm hình ảnh
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
                      ? `Đã kích hoạt lại “${asset.name}”. Hình ảnh có thể được chọn để tạo trò chơi.`
                      : `Đã ngừng sử dụng “${asset.name}”. Bạn có thể kích hoạt lại hình ảnh bất cứ lúc nào.`,
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
    </StaffPage>
  );
}
