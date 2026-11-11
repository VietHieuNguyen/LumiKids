"use client";

import { useRef, useState } from "react";
import { assetErrorMessage } from "../api";
import type { GameAssetsApi } from "../api";
import type { GameAsset } from "../types";
import { Modal } from "./modal";

export function AssetStatusDialog({
  asset,
  client,
  onClose,
  onSaved,
  onAccessError,
}: {
  asset: GameAsset;
  client: GameAssetsApi;
  onClose: () => void;
  onSaved: (asset: GameAsset) => void;
  onAccessError: (error: unknown) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const deactivate = asset.status === "ACTIVE";
  async function confirm() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      onSaved(
        await client.setStatus(asset.id, deactivate ? "INACTIVE" : "ACTIVE"),
      );
    } catch (failure) {
      setError(assetErrorMessage(failure));
      onAccessError(failure);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        deactivate
          ? "Chuyển học liệu sang INACTIVE?"
          : "Chuyển học liệu sang ACTIVE?"
      }
      onClose={onClose}
      busy={busy}
    >
      <div className="space-y-5 p-5 sm:p-7" aria-busy={busy}>
        <p className="text-sm leading-7 text-slate-600">
          <strong className="break-words text-slate-900">{asset.name}</strong>
          {deactivate
            ? " sẽ không được chọn để tạo trò chơi mới và không được cấp URL ảnh mới cho bản chơi thử. File ảnh và metadata vẫn được giữ lại; bạn có thể kích hoạt lại bất cứ lúc nào."
            : " sẽ được đưa lại vào danh sách ACTIVE và có thể được chọn để tạo trò chơi mới. File ảnh và metadata được giữ nguyên."}
        </p>
        {error && (
          <p role="alert" className="asset-error">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            autoFocus
            className="asset-button-secondary"
            disabled={busy}
            onClick={onClose}
          >
            Quay lại
          </button>
          <button
            type="button"
            disabled={busy}
            className={
              deactivate ? "asset-button-danger" : "asset-button-primary"
            }
            onClick={confirm}
          >
            {busy
              ? "Đang cập nhật…"
              : deactivate
                ? "Chuyển sang INACTIVE"
                : "Chuyển sang ACTIVE"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
