"use client";

import type { GameAssetsApi } from "../api";
import type { AssetStatus, GameAsset } from "../types";
import { AssetImage } from "./asset-image";
import { AssetIcon as Icon } from "./asset-icon";

export function AssetStatusBadge({ status }: { status: AssetStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ${status === "ACTIVE" ? "bg-leaf-soft text-leaf" : "bg-ink/5 text-ink-soft"}`}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${status === "ACTIVE" ? "bg-leaf" : "bg-ink-soft/50"}`}
      />
      {status === "ACTIVE"
        ? "Đang sử dụng"
        : "Ngừng sử dụng"}
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
      className={`flex min-w-0 flex-col overflow-hidden rounded-3xl border bg-paper shadow-sm transition-shadow hover:shadow-md ${highlighted ? "border-leaf ring-2 ring-leaf/20" : "border-line"}`}
    >
      <AssetImage
        client={client}
        id={asset.id}
        name={asset.name}
        onAccessError={onAccessError}
      />
      <div className="flex flex-1 flex-col p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold tracking-wide text-ink-soft">
            {asset.objectType}
          </span>
          <AssetStatusBadge status={asset.status} />
        </div>
        <h2
          className="mt-3 break-words font-display text-xl font-bold leading-7 text-ink"
          title={asset.name}
        >
          {asset.name}
        </h2>
        <div className="mb-4 mt-3 flex min-h-7 flex-wrap gap-1.5">
          {asset.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="max-w-full truncate rounded-md bg-cream px-2 py-1 text-xs text-ink-soft"
            >
              #{tag}
            </span>
          ))}
          {asset.tags.length > 3 && (
            <span className="rounded-md bg-cream px-2 py-1 text-xs text-ink-soft">
              +{asset.tags.length - 3}
            </span>
          )}
        </div>
        <div className="mt-auto border-t border-line pt-4">
          <button
            type="button"
            onClick={onDetail}
            className="asset-button-secondary w-full"
            aria-label={`Xem chi tiết ${asset.name}`}
          >
            Xem chi tiết<Icon name="arrow" className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onStatus}
            className={`mt-2 flex min-h-11 w-full items-center justify-center rounded-xl px-3 py-2.5 text-sm font-semibold ${asset.status === "ACTIVE" ? "text-ink-soft hover:bg-sun-soft" : "bg-leaf-soft text-leaf hover:bg-leaf/15"}`}
            aria-label={`${asset.status === "ACTIVE" ? "Ngừng sử dụng" : "Kích hoạt lại"} ${asset.name}`}
          >
            {asset.status === "ACTIVE"
              ? "Ngừng sử dụng"
              : "Kích hoạt lại"}
          </button>
        </div>
      </div>
    </article>
  );
}
