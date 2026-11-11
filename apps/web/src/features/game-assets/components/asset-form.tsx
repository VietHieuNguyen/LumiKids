"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { GameAssetsApi } from "../api";
import { assetErrorMessage } from "../api";
import {
  attributeInputFrom,
  createUploadBody,
  formatBytes,
  OBJECT_TYPES,
  prepareMetadata,
  validateFile,
} from "../metadata";
import type { GameAsset } from "../types";
import { AttributeEditor } from "./attribute-editor";
import { Modal } from "./modal";

function LocalPreview({
  file,
  onInvalid,
}: {
  file: File;
  onInvalid: () => void;
}) {
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(
    null,
  );
  useEffect(() => {
    const url = URL.createObjectURL(file);
    let active = true;
    queueMicrotask(() => {
      if (active) setPreview({ file, url });
    });
    return () => {
      active = false;
      URL.revokeObjectURL(url);
    };
  }, [file]);
  // Native img avoids sending private/blob URLs through Next Image Optimization.
  return preview?.file === file ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={preview.url}
      alt="Xem trước ảnh đã chọn"
      onError={onInvalid}
      className="h-28 w-28 rounded-xl bg-white object-contain"
    />
  ) : (
    <div className="h-28 w-28 rounded-xl bg-slate-100" />
  );
}

export function AssetForm({
  client,
  asset,
  onClose,
  onSaved,
  onAccessError,
}: {
  client: GameAssetsApi;
  asset?: GameAsset;
  onClose: () => void;
  onSaved: (asset: GameAsset, uploaded: boolean) => void;
  onAccessError: (error: unknown) => void;
}) {
  const id = useId();
  const [name, setName] = useState(asset?.name ?? "");
  const [objectType, setObjectType] = useState(asset?.objectType ?? "");
  const [tags, setTags] = useState(asset?.tags.join(", ") ?? "");
  const [attributes, setAttributes] = useState(() =>
    attributeInputFrom(asset?.attributes ?? {}),
  );
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    setError("");
    if (!asset) {
      const invalid = validateFile(file);
      setFileError(invalid ?? "");
      if (invalid) return;
    }
    try {
      const metadata = prepareMetadata(name, objectType, tags, attributes);
      submitting.current = true;
      setBusy(true);
      const saved = asset
        ? await client.update(asset.id, metadata)
        : await client.upload(createUploadBody(metadata, file!));
      onSaved(saved, !asset);
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
      title={asset ? "Chỉnh sửa hình ảnh" : "Thêm hình ảnh trò chơi"}
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={submit} className="space-y-6 p-5 sm:p-7" aria-busy={busy}>
        <fieldset disabled={busy} className="space-y-6 disabled:opacity-70">
          <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4 sm:p-5">
            <p className="text-sm font-semibold text-blue-950">
              Một hình ảnh, nhiều cách chơi
            </p>
            <p className="mt-2 text-sm leading-6 text-blue-900">
              Mô tả hình ảnh để hệ thống tìm đúng học liệu từ yêu cầu của giáo
              viên. Không cần tải ảnh riêng cho từng loại trò chơi.
            </p>
            <div className="mt-4 grid gap-2 text-xs leading-5 sm:grid-cols-3">
              {[
                ["Đếm số lượng", "Một ảnh có thể lặp thành nhiều đối tượng."],
                ["Ghép cặp", "Cần thêm ảnh đích và thông tin ghép tương ứng."],
                ["Phân loại", "Cần các ảnh và đặc điểm phù hợp với từng nhóm."],
              ].map(([title, description]) => (
                <div key={title} className="rounded-xl bg-white/80 px-3 py-2.5">
                  <p className="font-semibold text-blue-950">{title}</p>
                  <p className="mt-1 text-slate-600">{description}</p>
                </div>
              ))}
            </div>
          </div>
          {!asset && (
            <div>
              <label htmlFor={`${id}-file`} className="asset-label">
                File ảnh <span className="text-red-600">*</span>
              </label>
              <div className="mt-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
                <p
                  id={`${id}-file-help`}
                  className="mb-3 text-sm text-slate-500"
                >
                  PNG, JPEG hoặc WebP · tối đa 5 MiB
                </p>
                <input
                  id={`${id}-file`}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  aria-describedby={`${id}-file-help ${id}-file-error`}
                  aria-invalid={!!fileError}
                  className="block w-full rounded-lg text-sm text-slate-600 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-white file:px-4 file:py-2.5 file:font-medium file:text-blue-700 hover:file:bg-blue-50"
                  onChange={(event) => {
                    setError("");
                    const selected = event.target.files?.[0] ?? null;
                    const invalid = selected ? validateFile(selected) : null;
                    setFileError(invalid ?? "");
                    setFile(invalid ? null : selected);
                    if (selected && !invalid && !name.trim())
                      setName(
                        selected.name.replace(/\.[^.]+$/, "").slice(0, 200),
                      );
                  }}
                />
                {file && (
                  <div className="mt-4 flex items-center gap-4">
                    <LocalPreview
                      file={file}
                      onInvalid={() => {
                        setFileError(
                          "Không đọc được nội dung ảnh. Vui lòng chọn file ảnh khác.",
                        );
                        setFile(null);
                      }}
                    />
                    <div className="min-w-0">
                      <p className="break-all text-sm font-medium text-slate-700">
                        {file.name}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatBytes(file.size)}
                      </p>
                      <p className="mt-2 text-xs text-slate-500">
                        Chọn file khác ở trên để thay đổi.
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <p
                id={`${id}-file-error`}
                role={fileError ? "alert" : undefined}
                className="mt-2 text-sm text-red-700"
              >
                {fileError}
              </p>
            </div>
          )}
          {asset && (
            <p className="rounded-xl bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-800">
              Bạn đang chỉnh sửa thông tin hình ảnh. File ảnh gốc và mã asset
              được giữ nguyên.
            </p>
          )}
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="asset-label">
                Tên hình ảnh <span className="text-red-600">*</span>
              </span>
              <input
                autoFocus={!!asset}
                className="asset-input mt-2"
                required
                maxLength={200}
                value={name}
                placeholder="Ví dụ: Sư tử, Quả táo đỏ"
                aria-describedby={`${id}-name-help`}
                onChange={(event) => {
                  setError("");
                  setName(event.target.value);
                }}
              />
              <span
                id={`${id}-name-help`}
                className="mt-2 block text-xs leading-5 text-slate-500"
              >
                Nên dùng tên tiếng Việt rõ nghĩa, đúng với nội dung ảnh để khớp
                mô tả của giáo viên.
              </span>
            </label>
            <label className="block">
              <span className="asset-label">
                Loại đối tượng <span className="text-red-600">*</span>
              </span>
              <input
                className="asset-input mt-2"
                required
                maxLength={40}
                pattern="[A-Z][A-Z0-9_]{0,39}"
                title="Mã đối tượng cụ thể, ví dụ LION, APPLE, BALL; có thể nhập mã mới"
                placeholder="Ví dụ: LION"
                aria-describedby={`${id}-type-help`}
                list={`${id}-types`}
                value={objectType}
                onChange={(event) => {
                  setError("");
                  setObjectType(event.target.value.toUpperCase());
                }}
              />
              <datalist id={`${id}-types`}>
                {OBJECT_TYPES.map((type) => (
                  <option key={type} value={type} />
                ))}
              </datalist>
              <span
                id={`${id}-type-help`}
                className="mt-2 block text-xs leading-5 text-slate-500"
              >
                Mã viết hoa của đối tượng trong ảnh, ví dụ LION cho sư tử. Có
                thể nhập mã mới ngoài các gợi ý; đây không phải loại trò chơi.
              </span>
            </label>
          </div>
          <label className="block">
            <span className="asset-label">
              Từ khóa tìm ảnh (tags){" "}
              <span className="font-normal text-slate-400">· tùy chọn</span>
            </span>
            <input
              className="asset-input mt-2"
              maxLength={1600}
              value={tags}
              placeholder="Ví dụ: sư tử, lion, động vật, animal, savanna"
              aria-describedby={`${id}-tags-help ${id}-tags-games`}
              onChange={(event) => {
                setError("");
                setTags(event.target.value);
              }}
            />
            <span
              id={`${id}-tags-help`}
              className="mt-2 block text-xs leading-5 text-slate-500"
            >
              Thêm tên gọi, từ đồng nghĩa và đặc điểm bằng tiếng Việt hoặc tiếng
              Anh. Với đối tượng mới, nên có từ khóa tiếng Việt khớp prompt.
              Ngăn cách bằng dấu phẩy, tối đa 30 tags; tự chuyển về chữ thường.
            </span>
            <span
              id={`${id}-tags-games`}
              className="mt-2 block text-xs leading-5 text-blue-800"
            >
              Không bắt buộc gắn counting, matching hoặc classification. Các tag
              này không quyết định ảnh dùng được cho trò chơi nào.
            </span>
          </label>
          <AttributeEditor
            value={attributes}
            onChange={(value) => {
              setError("");
              setAttributes(value);
            }}
          />
        </fieldset>
        {error && (
          <p role="alert" className="asset-error">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="asset-button-secondary"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={busy}
            className="asset-button-primary"
          >
            {busy
              ? asset
                ? "Đang lưu…"
                : "Đang tải lên…"
              : asset
                ? "Lưu thay đổi"
                : "Tải ảnh lên"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
