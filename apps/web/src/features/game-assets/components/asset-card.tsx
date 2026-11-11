"use client";

import type { GameAssetsApi } from "../api";
import type { AssetStatus, GameAsset } from "../types";
import { AssetImage } from "./asset-image";

export function AssetStatusBadge({ status }: { status: AssetStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${status === "ACTIVE" ? "bg-emerald-500" : "bg-slate-400"}`}
      />
      {status === "ACTIVE"
        ? "ACTIVE · Đang sử dụng"
        : "INACTIVE · Ngừng sử dụng"}
    </span>
  );
}

export function AssetCard({
  asset,
  client,
  onDetail,
  onStatus,
  onAccessError,
  highlighted,
}: {
  asset: GameAsset;
  client: GameAssetsApi;
  onDetail: () => void;
  onStatus: () => void;
  onAccessError: (error: unknown) => void;
  highlighted: boolean;
}) {
  return (
    <article
      className={`flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-shadow hover:shadow-md ${highlighted ? "border-blue-400 ring-2 ring-blue-100" : "border-slate-200"}`}
    >
      <AssetImage
        client={client}
        id={asset.id}
        name={asset.name}
        onAccessError={onAccessError}
      />
      <div className="flex flex-1 flex-col p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold tracking-wide text-slate-500">
            {asset.objectType}
          </span>
          <AssetStatusBadge status={asset.status} />
        </div>
        <h2
          className="mt-3 truncate text-base font-semibold text-slate-900"
          title={asset.name}
        >
          {asset.name}
        </h2>
        <div className="mt-3 flex min-h-7 flex-wrap gap-1.5">
          {asset.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="max-w-full truncate rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-600"
            >
              #{tag}
            </span>
          ))}
          {asset.tags.length > 3 && (
            <span className="rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-500">
              +{asset.tags.length - 3}
            </span>
          )}
        </div>
        <div className="mt-auto pt-4">
          <button
            type="button"
            onClick={onDetail}
            className="asset-button-secondary w-full"
            aria-label={`Xem chi tiết ${asset.name}`}
          >
            Xem chi tiết{" "}
            <span aria-hidden="true" className="ml-auto">
              ↗
            </span>
          </button>
          <button
            type="button"
            onClick={onStatus}
            className={`mt-2 flex min-h-11 w-full items-center justify-center rounded-lg border px-3 py-2.5 text-sm font-medium ${asset.status === "ACTIVE" ? "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100" : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"}`}
            aria-label={`${asset.status === "ACTIVE" ? "Chuyển sang INACTIVE, ngừng sử dụng" : "Chuyển sang ACTIVE, kích hoạt lại"} ${asset.name}`}
          >
            {asset.status === "ACTIVE"
              ? "Ngừng sử dụng · INACTIVE"
              : "Kích hoạt lại · ACTIVE"}
          </button>
        </div>
      </div>
    </article>
  );
}
