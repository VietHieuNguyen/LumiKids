"use client";

import { useEffect, useState } from "react";
import { assetErrorMessage } from "../api";
import type { GameAssetsApi } from "../api";
import { formatBytes, formatDate } from "../metadata";
import type { GameAsset } from "../types";
import { AssetStatusBadge } from "./asset-card";
import { AssetImage } from "./asset-image";
import { Modal } from "./modal";

export function AssetDetail({
  client,
  id,
  onClose,
  onEdit,
  onStatus,
  onAccessError,
}: {
  client: GameAssetsApi;
  id: string;
  onClose: () => void;
  onEdit: (asset: GameAsset) => void;
  onStatus: (asset: GameAsset) => void;
  onAccessError: (error: unknown) => void;
}) {
  const [asset, setAsset] = useState<GameAsset | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [copyMessage, setCopyMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setLoading(true);
      setError("");
      client
        .detail(id, controller.signal)
        .then((result) => {
          if (active) setAsset(result);
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
  }, [client, id, attempt, onAccessError]);
  async function copyId() {
    try {
      await navigator.clipboard.writeText(id);
      setCopyMessage("Đã sao chép mã asset.");
    } catch {
      setCopyMessage(
        "Chưa sao chép được. Bạn có thể chọn và sao chép mã bên dưới.",
      );
    }
  }
  return (
    <Modal title="Chi tiết hình ảnh" onClose={onClose} wide>
      <div className="p-5 sm:p-7">
        {loading ? (
          <p role="status" className="py-16 text-center text-sm text-ink-soft">
            Đang tải thông tin hình ảnh…
          </p>
        ) : error ? (
          <div>
            <p role="alert" className="asset-error">
              {error}
            </p>
            <button
              type="button"
              className="asset-button-secondary mt-4"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Thử lại
            </button>
          </div>
        ) : (
          asset && (
            <>
              <div className="grid items-start gap-7 md:grid-cols-2">
                <div className="overflow-hidden rounded-2xl border border-line">
                  <AssetImage
                    client={client}
                    id={asset.id}
                    name={asset.name}
                    large
                    onAccessError={onAccessError}
                  />
                </div>
                <div className="min-w-0">
                  <AssetStatusBadge status={asset.status} />
                  <h3 className="mt-3 break-words font-display text-3xl font-bold text-ink">
                    {asset.name}
                  </h3>
                  <p className="mt-2 text-sm font-medium text-ink-soft">
                    {asset.objectType}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {asset.tags.length ? (
                      asset.tags.map((tag) => (
                        <span
                          key={tag}
                          className="max-w-full break-words rounded-lg bg-leaf-soft px-2.5 py-1 text-xs text-leaf"
                        >
                          #{tag}
                        </span>
                      ))
                    ) : (
                      <p className="text-sm text-ink-soft/70">Chưa có tags</p>
                    )}
                  </div>
                  <dl className="mt-6 space-y-3 border-y border-line py-5 text-sm">
                    <div className="flex justify-between gap-4">
                      <dt className="text-ink-soft">Định dạng</dt>
                      <dd className="font-medium text-ink">
                        {asset.mimeType}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-ink-soft">Dung lượng</dt>
                      <dd className="font-medium text-ink">
                        {formatBytes(asset.sizeBytes)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="shrink-0 text-ink-soft">Ngày tạo</dt>
                      <dd className="text-right text-ink">
                        {formatDate(asset.createdAt)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="shrink-0 text-ink-soft">Cập nhật</dt>
                      <dd className="text-right text-ink">
                        {formatDate(asset.updatedAt)}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-medium text-ink-soft">
                        Mã asset
                      </span>
                      <button
                        type="button"
                        className="asset-text-button"
                        onClick={copyId}
                      >
                        Sao chép
                      </button>
                    </div>
                    <p className="mt-2 select-all break-all font-mono text-xs leading-5 text-ink-soft">
                      {asset.id}
                    </p>
                    <p role="status" className="mt-1 text-xs text-ink-soft">
                      {copyMessage}
                    </p>
                  </div>
                </div>
              </div>
              <section
                className="mt-7"
                aria-labelledby="asset-attributes-heading"
              >
                <h3 id="asset-attributes-heading" className="asset-label">
                  Thuộc tính
                </h3>
                {Object.entries(asset.attributes).length ? (
                  <dl className="mt-3 divide-y divide-line rounded-xl border border-line">
                    {Object.entries(asset.attributes).map(([key, value]) => (
                      <div
                        key={key}
                        className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[10rem_1fr]"
                      >
                        <dt className="break-words font-medium text-ink-soft">
                          {key}
                        </dt>
                        <dd className="whitespace-pre-wrap break-all text-ink">
                          {typeof value === "string"
                            ? value
                            : JSON.stringify(value, null, 2)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="mt-2 text-sm text-ink-soft/70">
                    Chưa có thuộc tính.
                  </p>
                )}
              </section>
              <div className="mt-7 flex flex-wrap justify-end gap-3 border-t border-line pt-5">
                <button
                  type="button"
                  className="asset-button-secondary"
                  onClick={() => onStatus(asset)}
                >
                  {asset.status === "ACTIVE"
                    ? "Ngừng sử dụng"
                    : "Kích hoạt lại"}
                </button>
                <button
                  type="button"
                  className="asset-button-primary"
                  onClick={() => onEdit(asset)}
                >
                  Chỉnh sửa thông tin
                </button>
              </div>
            </>
          )
        )}
      </div>
    </Modal>
  );
}
