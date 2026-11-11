"use client";

import { useState } from "react";
import { readableGameText } from "./display-text";
import type {
  ResolvedAssetUrls,
  AssetRevisions,
  AssetErrorHandler,
} from "./types";

function Picture({
  url,
  label,
  onError,
  fit,
}: {
  url: string;
  label: string;
  onError: () => void;
  fit: "contain" | "cover";
}) {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <span className="game-image-fallback">
        <span aria-hidden="true">▧</span>
        <span>{readableGameText(label)}</span>
        <span className="text-xs font-normal">Ảnh chưa tải được</span>
      </span>
    );
  // Presigned URLs must not be rewritten or sent through Next's image proxy.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      role="img"
      aria-label={readableGameText(label)}
      draggable={false}
      referrerPolicy="no-referrer"
      className={`h-full w-full select-none ${fit === "cover" ? "object-cover" : "object-contain"}`}
      onError={() => {
        setFailed(true);
        onError();
      }}
    />
  );
}

export function GamePicture({
  assetId,
  label,
  assetUrls,
  assetRevisions,
  onAssetError,
  className = "h-20 w-20 sm:h-24 sm:w-24",
  fit = "contain",
}: {
  assetId?: string;
  label: string;
  assetUrls: ResolvedAssetUrls;
  assetRevisions?: AssetRevisions;
  onAssetError?: AssetErrorHandler;
  className?: string;
  fit?: "contain" | "cover";
}) {
  const url = assetId ? assetUrls[assetId] : undefined;
  const revision = assetId ? (assetRevisions?.[assetId] ?? 0) : 0;
  const usable =
    url &&
    (/^https?:\/\//i.test(url) ||
      (url.startsWith("/") && !url.startsWith("//")));
  return (
    <span className={`block shrink-0 ${className}`}>
      {usable ? (
        <Picture
          key={`${url}:${revision}`}
          url={url}
          label={label}
          fit={fit}
          onError={() => {
            if (assetId) onAssetError?.(assetId, url, revision);
          }}
        />
      ) : (
        <span className="game-image-fallback">
          <span aria-hidden="true">▧</span>
          <span>{readableGameText(label)}</span>
          {assetId && <span className="text-xs font-normal">Chưa có ảnh</span>}
        </span>
      )}
    </span>
  );
}
