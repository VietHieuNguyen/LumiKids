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
          <p role="status" className="py-16 text-center text-sm text-slate-500">
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
                <div className="overflow-hidden rounded-2xl border border-slate-200">
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
                  <h3 className="mt-3 break-words text-2xl font-semibold text-slate-900">
                    {asset.name}
                  </h3>
                  <p className="mt-2 text-sm font-medium text-slate-500">
                    {asset.objectType}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {asset.tags.length ? (
                      asset.tags.map((tag) => (
                        <span
                          key={tag}
                          className="max-w-full break-words rounded-lg bg-blue-50 px-2.5 py-1 text-xs text-blue-700"
                        >
                          #{tag}
                        </span>
                      ))
                    ) : (
                      <p className="text-sm text-slate-400">Chưa có tags</p>
                    )}
                  </div>
                  <dl className="mt-6 space-y-3 border-y border-slate-100 py-5 text-sm">
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">Định dạng</dt>
                      <dd className="font-medium text-slate-700">
                        {asset.mimeType}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">Dung lượng</dt>
                      <dd className="font-medium text-slate-700">
                        {formatBytes(asset.sizeBytes)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="shrink-0 text-slate-500">Ngày tạo</dt>
                      <dd className="text-right text-slate-700">
                        {formatDate(asset.createdAt)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="shrink-0 text-slate-500">Cập nhật</dt>
                      <dd className="text-right text-slate-700">
                        {formatDate(asset.updatedAt)}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-medium text-slate-500">
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
                    <p className="mt-2 select-all break-all font-mono text-xs leading-5 text-slate-600">
                      {asset.id}
                    </p>
                    <p role="status" className="mt-1 text-xs text-slate-500">
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
                  <dl className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {Object.entries(asset.attributes).map(([key, value]) => (
                      <div
                        key={key}
                        className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[10rem_1fr]"
                      >
                        <dt className="break-words font-medium text-slate-600">
                          {key}
                        </dt>
                        <dd className="whitespace-pre-wrap break-all text-slate-800">
                          {typeof value === "string"
                            ? value
                            : JSON.stringify(value, null, 2)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="mt-2 text-sm text-slate-400">
                    Chưa có thuộc tính.
                  </p>
                )}
              </section>
              <div className="mt-7 flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-5">
                <button
                  type="button"
                  className="asset-button-secondary"
                  onClick={() => onStatus(asset)}
                >
                  {asset.status === "ACTIVE"
                    ? "Chuyển INACTIVE · Ngừng sử dụng"
                    : "Chuyển ACTIVE · Kích hoạt lại"}
                </button>
                <button
                  type="button"
                  className="asset-button-primary"
                  onClick={() => onEdit(asset)}
                >
                  Chỉnh sửa metadata
                </button>
              </div>
            </>
          )
        )}
      </div>
    </Modal>
  );
}
