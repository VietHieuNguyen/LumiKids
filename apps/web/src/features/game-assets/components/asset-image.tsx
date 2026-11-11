"use client";

import { useEffect, useRef, useState } from "react";
import { assetErrorMessage } from "../api";
import type { GameAssetsApi } from "../api";
import type { AssetReadUrl } from "../types";

export function AssetImage({
  client,
  id,
  name,
  large = false,
  onAccessError,
}: {
  client: GameAssetsApi;
  id: string;
  name: string;
  large?: boolean;
  onAccessError: (error: unknown) => void;
}) {
  const [image, setImage] = useState<AssetReadUrl | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const autoRetried = useRef(false);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function load(force: boolean) {
      if (!active) return;
      setLoading(true);
      setError("");
      client
        .getReadUrl(id, force)
        .then((result) => {
          if (!active) return;
          setImage(result);
          setLoading(false);
          // Renew while mounted before expiry, including long-open detail dialogs.
          const delay = Math.max(
            Date.parse(result.expiresAt) - Date.now() - 30000,
            1000,
          );
          timer = setTimeout(() => load(true), delay);
        })
        .catch((failure: unknown) => {
          if (!active) return;
          setLoading(false);
          setImage(null);
          setError(assetErrorMessage(failure));
          onAccessError(failure);
        });
    }
    queueMicrotask(() => load(attempt > 0));
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        load(false);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [client, id, attempt, onAccessError]);

  return (
    <div
      className={`asset-image-surface relative flex items-center justify-center overflow-hidden ${large ? "min-h-64 sm:min-h-80" : "aspect-[4/3]"}`}
    >
      {image && !error && (
        <>
          {/* Keep signed URL unchanged and outside Next's image proxy/cache. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.url}
            alt={name}
            loading="lazy"
            referrerPolicy="no-referrer"
            className={`h-full w-full object-contain p-5 ${large ? "max-h-96" : "absolute inset-0"}`}
            onLoad={() => {
              autoRetried.current = false;
            }}
            onError={() => {
              if (!autoRetried.current) {
                autoRetried.current = true;
                setImage(null);
                setLoading(true);
                setAttempt((value) => value + 1);
              } else {
                setError("Không hiển thị được ảnh. Vui lòng thử tải lại.");
                setImage(null);
              }
            }}
          />
        </>
      )}
      {loading && (
        <p
          role="status"
          className="rounded-lg bg-white/90 px-3 py-2 text-xs text-slate-500"
        >
          Đang tải ảnh…
        </p>
      )}
      {error && (
        <div className="max-w-64 px-5 py-6 text-center">
          <span aria-hidden="true" className="text-2xl text-slate-400">
            ▧
          </span>
          <p className="mt-2 text-xs leading-5 text-slate-600">{error}</p>
          <button
            type="button"
            className="asset-text-button mt-3"
            onClick={() => {
              autoRetried.current = false;
              setAttempt((value) => value + 1);
            }}
          >
            Tải lại ảnh
          </button>
        </div>
      )}
    </div>
  );
}
