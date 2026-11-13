"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { PlayableGame } from "@lumikids/shared";
import { GameSymbol } from "../game-runtime/components/game-symbol";
import { difficultyLabels, gameTypeLabels } from "../game-library/library-page";
import type { GameplayApi } from "./api";
import { gameplayError } from "./api";
import { useGameplaySession } from "./use-gameplay-session";

export function ChildGamesPage() {
  const { session, loading, api, canPlay } = useGameplaySession();
  if (loading || !session || !api)
    return (
      <main className="p-8" role="status">
        Đang kiểm tra phiên đăng nhập…
      </main>
    );
  if (!canPlay)
    return <main className="p-8">Tài khoản này chưa được phép chơi.</main>;
  return <GameList key={session.user.userId} api={api} />;
}

function GameList({ api }: { api: GameplayApi }) {
  const [items, setItems] = useState<PlayableGame[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [loaded, setLoaded] = useState<{
    api: GameplayApi;
    page: number;
    retry: number;
  } | null>(null);
  const busy =
    !loaded ||
    loaded.api !== api ||
    loaded.page !== page ||
    loaded.retry !== retry;
  useEffect(() => {
    const abort = new AbortController();
    api
      .list(
        new URLSearchParams({ page: String(page), pageSize: "12" }),
        abort.signal,
      )
      .then((result) => {
        if (abort.signal.aborted) return;
        setItems((current) =>
          page === 1
            ? result.items
            : [
                ...current,
                ...result.items.filter(
                  (item) =>
                    !current.some((seen) => seen.versionId === item.versionId),
                ),
              ],
        );
        setTotalPages(result.pagination.totalPages);
        setError("");
      })
      .catch((failure) => {
        if (!abort.signal.aborted) setError(gameplayError(failure));
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoaded({ api, page, retry });
      });
    return () => abort.abort();
  }, [api, page, retry]);
  return (
    <main className="min-h-dvh bg-slate-50 px-3 py-5 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-bold">Cùng chơi nào!</h1>
          <Link className="asset-button-secondary" href="/account">
            ← Tài khoản
          </Link>
        </header>
        {error && (
          <div role="alert" className="asset-error mb-4">
            {error}
            <button
              className="asset-button-secondary ml-3"
              onClick={() => setRetry((n) => n + 1)}
            >
              Thử lại
            </button>
          </div>
        )}
        {!busy && !error && items.length === 0 && (
          <p className="rounded-2xl bg-white p-8 text-center">
            Chưa có trò chơi nào. Con quay lại sau nhé!
          </p>
        )}
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((game) => (
            <li key={game.versionId}>
              <Link
                href={`/child/games/${game.versionId}`}
                className="flex h-full flex-col items-center gap-3 rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm hover:border-blue-300"
              >
                <span className="game-mode-emblem" aria-hidden="true">
                  <GameSymbol type={game.gameType} />
                </span>
                <span className="break-words text-lg font-bold">
                  {game.name}
                </span>
                <span className="text-sm text-slate-500">
                  {gameTypeLabels[game.gameType]} ·{" "}
                  {difficultyLabels[game.difficulty]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {busy && (
          <p className="p-8 text-center" role="status">
            Đang tải trò chơi…
          </p>
        )}
        {!busy && page < totalPages && (
          <div className="mt-6 text-center">
            <button
              className="asset-button-secondary"
              onClick={() => setPage((n) => n + 1)}
            >
              Xem thêm trò chơi
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
