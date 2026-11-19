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
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-7 text-ink sm:px-6 sm:pt-9">
      <div className="min-w-0">
        <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-leaf">Học liệu · Không gian xem thử</p>
            <h1 className="font-display text-4xl font-extrabold leading-tight text-ink">
              Xem thử trò chơi
            </h1>
            <p className="mt-2 text-sm leading-6 text-ink-soft">
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
            className="mb-5 rounded-2xl border border-sun-edge/30 bg-sun-soft p-4"
            aria-label="JSON mẫu phát triển"
          >
            <h2 className="text-sm font-semibold text-[#805b13]">
              Mẫu phát triển · ảnh minh họa cục bộ
            </h2>
            <p className="mt-2 text-xs leading-5 text-[#805b13]">
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
          className="mb-5 rounded-2xl border border-line bg-paper p-5"
        >
          <summary className="cursor-pointer font-semibold text-ink">
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
          <p className="mt-2 text-xs leading-5 text-ink-soft">
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
                className="mb-4 rounded-xl bg-sun-soft px-4 py-3 text-sm text-[#805b13]"
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
            <p className="rounded-2xl border border-dashed border-ink/20 bg-paper p-8 text-center text-sm text-ink-soft">
              Dán nội dung trò chơi hoặc chọn một mẫu phát triển để bắt đầu xem
              thử.
            </p>
          )
        )}
      </div>
    </main>
  );
}
