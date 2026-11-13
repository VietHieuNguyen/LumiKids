"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { gameContentSchema } from "@lumikids/shared";
import type { GameContent, GameInteraction } from "@lumikids/shared";
import { GameRuntime } from "../game-runtime/game-runtime";
import { gameRegistry } from "../game-runtime/registry";
import type { RuntimeCallbacks } from "../game-runtime/model/controller";
import type { PreviewAssetReader } from "./asset-resolver";
import { usePreviewAssets } from "./use-preview-assets";

export interface GamePreviewProps extends RuntimeCallbacks {
  content: unknown;
  assetReader: PreviewAssetReader;
  backHref?: string;
  backLabel?: string;
  controlsPosition?: "before" | "after";
  showDebug?: boolean;
  mode?: "PREVIEW" | "PLAY";
  /** Extra pause on top of image readiness, e.g. while a play session starts. */
  paused?: boolean;
  defaultExpanded?: boolean;
  onReset?: () => void;
}
function getAssetLabels(content: GameContent): Map<string, string> {
  const items =
    content.gameType === "MATCHING"
      ? [...content.sourceItems, ...content.targetItems]
      : content.items;
  const labels = new Map<string, string>();
  items.forEach((item) =>
    labels.set(item.assetId, item.label ?? "Hình ảnh trong trò chơi"),
  );
  if (content.gameType === "CLASSIFICATION")
    content.groups.forEach((group) => {
      if (group.assetId) labels.set(group.assetId, group.label);
    });
  return labels;
}
function ValidatedPreview({
  content,
  assetReader,
  backHref = "/account",
  backLabel = "Quay lại",
  controlsPosition = "before",
  showDebug = false,
  mode = "PREVIEW",
  paused = false,
  defaultExpanded = false,
  onInteraction,
  onComplete,
  onReset,
}: Omit<GamePreviewProps, "content"> & { content: GameContent }) {
  const { snapshot, resolver } = usePreviewAssets(content, assetReader);
  const [completed, setCompleted] = useState(false);
  const [events, setEvents] = useState<GameInteraction[]>([]);
  const debug = process.env.NODE_ENV === "development" && showDebug;
  const labels = getAssetLabels(content);
  const preview = mode === "PREVIEW";
  const controls = (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-800">
        {preview ? "Xem thử" : "Trò chơi"} ·{" "}
        {gameRegistry[content.gameType].label}
      </h2>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link className="asset-button-secondary" href={backHref}>
          ← {backLabel}
        </Link>
        <span
          role="status"
          className={`rounded-full px-3 py-2 text-sm font-semibold ${completed ? "bg-emerald-50 text-emerald-800" : "bg-blue-50 text-blue-800"}`}
        >
          {completed
            ? "Đã hoàn thành"
            : snapshot.status === "ready"
              ? preview
                ? "Đang chơi thử"
                : "Đang chơi"
              : snapshot.status === "error"
                ? "Chưa sẵn sàng"
                : "Đang chuẩn bị hình ảnh"}
        </span>
      </div>
    </div>
  );
  return (
    <section
      className="space-y-4"
      aria-label={preview ? "Xem thử trò chơi" : "Trò chơi"}
    >
      {controlsPosition === "before" && controls}
      {snapshot.status === "loading" && (
        <div
          role="status"
          className="rounded-2xl border border-blue-100 bg-blue-50 px-5 py-6 text-sm text-blue-800"
        >
          Đang tải hình ảnh… {snapshot.total - snapshot.pending}/
          {snapshot.total}
        </div>
      )}
      {snapshot.issues.length > 0 && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
          <h2 className="font-semibold text-rose-800">
            Chưa thể xem thử đầy đủ hình ảnh
          </h2>
          <ul className="mt-3 space-y-2">
            {snapshot.issues.map((issue) => (
              <li
                key={issue.assetId}
                className="text-sm leading-6 text-rose-800"
              >
                <strong>{labels.get(issue.assetId) ?? "Hình ảnh"}</strong>:{" "}
                {issue.message}
                <details className="text-xs">
                  <summary className="cursor-pointer">
                    Xem mã ảnh cần kiểm tra
                  </summary>
                  <span className="break-all font-mono">{issue.assetId}</span>
                </details>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-rose-700">
            Trò chơi được tạm dừng để tránh chơi với ảnh thiếu. Tiến độ hiện tại
            được giữ nguyên.
          </p>
          <button
            type="button"
            disabled={snapshot.refreshing}
            className="asset-button-secondary mt-4"
            onClick={() => {
              void resolver.retry();
            }}
          >
            Thử tải lại ảnh
          </button>
        </div>
      )}
      <div hidden={!snapshot.hasLoaded}>
        <GameRuntime
          content={content}
          mode={mode}
          defaultExpanded={defaultExpanded}
          assetUrls={snapshot.urls}
          assetRevisions={snapshot.revisions}
          paused={paused || snapshot.status !== "ready"}
          onAssetError={resolver.reportImageError}
          onInteraction={(event) => {
            if (debug) setEvents((current) => [...current.slice(-99), event]);
            onInteraction?.(event);
          }}
          onComplete={(summary) => {
            setCompleted(true);
            onComplete?.(summary);
          }}
          onReset={() => {
            setCompleted(false);
            setEvents([]);
            onReset?.();
          }}
        />
      </div>
      {controlsPosition === "after" && controls}
      {snapshot.status === "ready" && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          <span role="status" className="text-xs text-slate-500">
            {snapshot.refreshing
              ? "Đang làm mới ảnh…"
              : preview
                ? "Chơi thử không lưu kết quả đánh giá."
                : "Lượt chơi của con đang được lưu lại."}
          </span>
          <button
            type="button"
            disabled={snapshot.refreshing}
            className="asset-text-button"
            onClick={() => {
              void resolver.retry();
            }}
          >
            Làm mới ảnh
          </button>
        </div>
      )}
      {debug && (
        <details className="rounded-2xl border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-medium text-slate-600">
            Debug tương tác · {events.length} event trong bộ nhớ
          </summary>
          <p className="mt-3 text-xs text-slate-500">
            Chỉ hiển thị trong development, giữ tối đa 100 event của lượt hiện
            tại.
          </p>
          <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-all text-xs">
            {JSON.stringify(events, null, 2)}
          </pre>
        </details>
      )}
    </section>
  );
}

/** Reusable boundary for a future Backend/AI payload; no demo data, auth or persistence inside. */
export function GamePreview(props: GamePreviewProps) {
  const parsed = useMemo(
    () => gameContentSchema.safeParse(props.content),
    [props.content],
  );
  if (!parsed.success)
    return (
      <section role="alert" className="asset-error">
        <h2 className="font-semibold">Nội dung trò chơi chưa hợp lệ</h2>
        <p className="mt-2">
          Vui lòng kiểm tra loại trò chơi, phiên bản, đáp án và các mã tham
          chiếu trước khi xem thử.
        </p>
        <Link
          href={props.backHref ?? "/account"}
          className="asset-button-secondary mt-4"
        >
          ← {props.backLabel ?? "Quay lại"}
        </Link>
      </section>
    );
  return (
    <ValidatedPreview
      key={JSON.stringify(parsed.data)}
      {...props}
      content={parsed.data}
    />
  );
}
