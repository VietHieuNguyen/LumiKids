"use client";

import Link from "next/link";
import { useState } from "react";
import { gameContentSchema } from "@lumikids/shared";
import type { GameContent, GameType } from "@lumikids/shared";
import { GamePreview } from "../../game-preview/game-preview";
import type { PreviewAssetReader } from "../../game-preview/asset-resolver";
import { demoAssetUrls, demoContents } from "../demo-content";
import { gameRegistry } from "../registry";
import type { GameAssetsApi } from "../../game-assets/api";

const developmentReader: PreviewAssetReader = {
  async getReadUrl(id) {
    if (process.env.NODE_ENV !== "development")
      throw new Error("Development fixtures are disabled.");
    const url = demoAssetUrls[id];
    if (!url)
      throw Object.assign(new Error("Unknown fixture asset."), { status: 404 });
    return {
      url,
      expiresIn: 3600,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    };
  },
};

/** Development/input host only. All loading/game logic lives in reusable GamePreview. */
export function RuntimePreview({
  client,
  canManageAssets = false,
}: {
  client: GameAssetsApi;
  canManageAssets?: boolean;
}) {
  const isDevelopment = process.env.NODE_ENV === "development";
  const [draft, setDraft] = useState("");
  const [request, setRequest] = useState<{
    content: GameContent;
    source: "library" | "development";
    revision: number;
  } | null>(null);
  const [error, setError] = useState("");
  function apply(content: GameContent, source: "library" | "development") {
    setDraft(JSON.stringify(content, null, 2));
    setError("");
    setRequest((current) => ({
      content,
      source,
      revision: (current?.revision ?? 0) + 1,
    }));
  }
  function applyJson() {
    setError("");
    try {
      const candidate: unknown = JSON.parse(draft);
      const parsed = gameContentSchema.safeParse(candidate);
      if (!parsed.success) {
        setRequest(null);
        setError(
          "Nội dung JSON chưa khớp GameContent. Hãy kiểm tra schemaVersion, gameType, đáp án và các ID tham chiếu.",
        );
        return;
      }
      apply(parsed.data, "library");
    } catch {
      setRequest(null);
      setError("JSON chưa hợp lệ. Vui lòng kiểm tra dấu ngoặc và dấu nháy.");
    }
  }
  return (
    <main className="min-h-dvh bg-slate-50 px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/account" className="font-bold text-blue-700">
              LumiKids
            </Link>
            <h1 className="mt-3 text-3xl font-bold text-slate-900">
              Xem thử trò chơi
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Chơi thử nội dung trước khi sử dụng. Không lưu phiên chơi hoặc dữ
              liệu đánh giá.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {!request && (
              <Link href="/account" className="asset-button-secondary">
                ← Quay lại
              </Link>
            )}
            {canManageAssets && (
              <Link
                href="/admin/game-assets"
                className="asset-button-secondary"
              >
                Thư viện hình ảnh
              </Link>
            )}
          </div>
        </header>
        {isDevelopment && (
          <section
            className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4"
            aria-label="JSON mẫu phát triển"
          >
            <h2 className="text-sm font-semibold text-amber-900">
              Mẫu phát triển · ảnh minh họa cục bộ
            </h2>
            <p className="mt-2 text-xs leading-5 text-amber-800">
              Ba JSON Bước 4A dùng UUID minh họa chưa có trong database. Các nút
              dưới chỉ dùng ảnh mẫu, không giả lập API hoặc thay ảnh khi Library
              báo lỗi.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(Object.keys(demoContents) as GameType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  className="asset-button-secondary"
                  onClick={() => apply(demoContents[type], "development")}
                >
                  {gameRegistry[type].label}
                </button>
              ))}
            </div>
          </section>
        )}
        <details
          open={!request}
          className="mb-5 rounded-2xl border border-slate-200 bg-white p-5"
        >
          <summary className="cursor-pointer font-semibold text-slate-700">
            Nhập GameContent JSON để xem thử với ảnh thư viện
          </summary>
          <label className="mt-4 block">
            <span className="asset-label">GameContent JSON</span>
            <textarea
              className="asset-input mt-2 min-h-60 font-mono text-xs"
              value={draft}
              maxLength={100000}
              spellCheck={false}
              placeholder="Dán GameContent JSON đã có assetId thật…"
              onChange={(event) => setDraft(event.target.value)}
            />
          </label>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Ảnh được đọc tự động qua Backend theo đúng assetId trong JSON. Không
            upload hoặc lưu nội dung từ trang này.
          </p>
          <button
            type="button"
            className="asset-button-primary mt-4"
            onClick={applyJson}
          >
            Kiểm tra và xem thử
          </button>
        </details>
        {error && (
          <p role="alert" className="asset-error mb-5">
            {error}
          </p>
        )}
        {request ? (
          <>
            {request.source === "development" && (
              <p
                role="status"
                className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900"
              >
                Đang dùng ảnh mẫu development. Để kiểm tra MinIO thật, thay UUID
                mẫu bằng assetId có sẵn rồi chọn “Kiểm tra và xem thử”.
              </p>
            )}
            <GamePreview
              key={request.revision}
              content={request.content}
              assetReader={
                request.source === "development" ? developmentReader : client
              }
              backHref="/account"
              backLabel="Tài khoản"
              showDebug={isDevelopment}
            />
          </>
        ) : (
          !error && (
            <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              Dán nội dung trò chơi hoặc chọn một mẫu phát triển để bắt đầu xem
              thử.
            </p>
          )
        )}
      </div>
    </main>
  );
}
