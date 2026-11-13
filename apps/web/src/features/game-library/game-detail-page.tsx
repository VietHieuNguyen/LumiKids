"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SavedGameDetail } from "@lumikids/shared";
import { GamePreview } from "../game-preview/game-preview";
import { GameLibraryApi, libraryError } from "./api";
import { useLibrarySession } from "./use-library-session";
import { difficultyLabels, gameTypeLabels } from "./library-page";

export function GameDetailPage({
  versionId,
  admin = false,
}: {
  versionId: string;
  admin?: boolean;
}) {
  const { session, loading, api } = useLibrarySession();
  if (loading || !session || !api)
    return (
      <main className="p-8" role="status">
        Đang kiểm tra phiên đăng nhập…
      </main>
    );
  if (
    !session.user.permissions.includes("READ_GAMES") ||
    (admin && !session.user.permissions.includes("MANAGE_ALL_GAMES"))
  )
    return (
      <main className="p-8">Bạn chưa có quyền truy cập kho trò chơi này.</main>
    );
  return (
    <DetailContent
      key={`${session.user.userId}:${versionId}`}
      api={api}
      versionId={versionId}
      base={admin ? "/admin/games" : "/teacher/games"}
      userId={session.user.userId}
      manageAll={session.user.permissions.includes("MANAGE_ALL_GAMES")}
      canSave={session.user.permissions.includes("SAVE_GAMES")}
    />
  );
}
function DetailContent({
  api,
  versionId,
  base,
  userId,
  manageAll,
  canSave,
}: {
  api: GameLibraryApi;
  versionId: string;
  base: string;
  userId: string;
  manageAll: boolean;
  canSave: boolean;
}) {
  const [game, setGame] = useState<SavedGameDetail | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [loaded, setLoaded] = useState<{
    api: GameLibraryApi;
    versionId: string;
    retry: number;
  } | null>(null);
  const busy =
    !loaded ||
    loaded.api !== api ||
    loaded.versionId !== versionId ||
    loaded.retry !== retry;
  const operation = useRef<AbortController | null>(null);
  useEffect(() => () => operation.current?.abort(), []);
  useEffect(() => {
    const abort = new AbortController();
    api
      .detail(versionId, abort.signal)
      .then((value) => {
        if (!abort.signal.aborted) {
          setGame(value);
          setError("");
        }
      })
      .catch((failure) => {
        if (!abort.signal.aborted) setError(libraryError(failure));
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoaded({ api, versionId, retry });
      });
    return () => abort.abort();
  }, [api, versionId, retry]);
  const reader = useMemo(() => api.reader(versionId), [api, versionId]);
  async function changeStatus() {
    if (!game || statusBusy) return;
    const status = game.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE";
    if (
      status === "ARCHIVED" &&
      !window.confirm(
        "Chuyển trò chơi sang lưu trữ? Trò sẽ được ẩn khỏi kho chung và có thể khôi phục sau.",
      )
    )
      return;
    const abort = new AbortController();
    operation.current = abort;
    setStatusBusy(true);
    setStatusError("");
    try {
      const result = await api.status(versionId, status, abort.signal);
      if (!abort.signal.aborted) setGame(result);
    } catch (failure) {
      if (!abort.signal.aborted) setStatusError(libraryError(failure));
    } finally {
      if (!abort.signal.aborted) setStatusBusy(false);
    }
  }
  return (
    <main className="min-h-dvh bg-slate-50 px-3 py-5 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-[1600px]">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <Link className="asset-button-secondary" href={base}>
            ← Kho trò chơi
          </Link>
          {game && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-indigo-100 px-3 py-2 text-xs font-semibold text-indigo-800">
                {gameTypeLabels[game.gameType]}
              </span>
              <span className="rounded-full bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-900">
                {difficultyLabels[game.difficulty]}
              </span>
            </div>
          )}
        </header>
        {busy && !game ? (
          <p className="p-10 text-center" role="status">
            Đang mở trò chơi…
          </p>
        ) : error ? (
          <div role="alert" className="asset-error">
            {error}
            <button
              className="asset-button-secondary ml-3"
              onClick={() => setRetry((n) => n + 1)}
            >
              Thử lại
            </button>
          </div>
        ) : (
          game && (
            <>
              <h1 className="mb-5 break-words text-2xl font-bold">
                {game.name}
              </h1>
              {game.status === "ARCHIVED" && (
                <p className="mb-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
                  Trò chơi đang được lưu trữ và đã ẩn khỏi kho chung.
                </p>
              )}
              <GamePreview
                content={game.content}
                assetReader={reader}
                backHref={base}
                backLabel="Kho trò chơi"
                controlsPosition="after"
              />
              <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6">
                <div className="flex flex-wrap justify-between gap-5">
                  <div>
                    <h2 className="text-lg font-bold">
                      Thông tin dành cho giáo viên
                    </h2>
                    <p className="mt-2 text-sm text-slate-500">
                      {game.creatorName} · Phiên bản {game.versionNumber} ·{" "}
                      {new Date(game.createdAt).toLocaleDateString("vi-VN")}
                    </p>
                  </div>
                  {(manageAll || (canSave && game.createdBy === userId)) && (
                    <button
                      className="asset-button-secondary"
                      disabled={statusBusy}
                      onClick={() => void changeStatus()}
                    >
                      {statusBusy
                        ? "Đang cập nhật…"
                        : game.status === "ACTIVE"
                          ? "Chuyển sang lưu trữ"
                          : "Khôi phục vào kho"}
                    </button>
                  )}
                </div>
                {statusError && (
                  <p role="alert" className="asset-error mt-4">
                    {statusError}
                  </p>
                )}
                {game.description && (
                  <p className="mt-5 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                    {game.description}
                  </p>
                )}
                <h3 className="mt-6 text-sm font-bold">Chỉ số được chọn</h3>
                <ul className="mt-3 grid gap-3 md:grid-cols-2">
                  {game.criterions.map((c) => (
                    <li
                      className="rounded-xl bg-indigo-50 p-4 text-sm leading-6 text-indigo-950"
                      key={c.criterionCode}
                    >
                      <strong>
                        Chuẩn {c.skillCode} · Chỉ số {c.criterionCode}
                      </strong>
                      <p>{c.description}</p>
                    </li>
                  ))}
                </ul>
                <details className="mt-5 rounded-xl border border-slate-100 p-4">
                  <summary className="cursor-pointer text-sm font-semibold">
                    Hướng dẫn đã lưu
                  </summary>
                  <p className="mt-3 text-sm leading-6">
                    {game.content.instruction}
                  </p>
                </details>
                <p className="mt-5 text-xs leading-5 text-slate-500">
                  Lượt chơi thử không lưu kết quả của trẻ. Việc chọn chỉ số xác
                  định mục tiêu của trò chơi và chưa phải kết quả đánh giá.
                </p>
              </section>
            </>
          )
        )}
      </div>
    </main>
  );
}
