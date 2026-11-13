"use client";
/* eslint-disable @next/next/no-img-element -- Private, short-lived API URLs are loaded directly. */
import Link from "next/link";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { GameLibraryPage, SavedGame, Skill } from "@lumikids/shared";
import { GameLibraryApi, libraryError } from "./api";
import { useLibrarySession } from "./use-library-session";

export const gameTypeLabels = {
  COUNTING: "Đếm số lượng",
  MATCHING: "Ghép cặp",
  CLASSIFICATION: "Phân loại",
};
export const difficultyLabels = {
  EASY: "Dễ",
  MEDIUM: "Trung bình",
  HARD: "Khó",
};
const gameIcons = { COUNTING: "●", MATCHING: "↔", CLASSIFICATION: "▦" };
function Cover({ api, game }: { api: GameLibraryApi; game: SavedGame }) {
  const [images, setImages] = useState<{ id: string; url: string }[]>([]);
  useEffect(() => {
    let current = true;
    void Promise.allSettled(
      game.coverAssetIds.map(async (id) => ({
        id,
        url: (await api.readUrl(game.versionId, id)).url,
      })),
    ).then((results) => {
      if (current)
        setImages(
          results.flatMap((result) =>
            result.status === "fulfilled" ? [result.value] : [],
          ),
        );
    });
    return () => {
      current = false;
    };
  }, [api, game]);
  return (
    <div
      className="flex h-44 items-center justify-center gap-3 overflow-hidden bg-gradient-to-br from-indigo-50 via-sky-50 to-amber-50 px-5"
      aria-hidden="true"
    >
      {images.length ? (
        images.map((image, index) => (
          <div
            className={`flex h-24 min-w-0 flex-1 items-center justify-center rounded-2xl border-2 border-white bg-white/90 p-2 shadow-sm ${index % 2 ? "-rotate-6" : "rotate-3"}`}
            key={image.id}
          >
            <img
              src={image.url}
              alt=""
              className="h-full w-full object-contain"
              onError={(event) => {
                event.currentTarget.style.visibility = "hidden";
              }}
            />
          </div>
        ))
      ) : (
        <span className="text-6xl text-indigo-300">
          {gameIcons[game.gameType]}
        </span>
      )}
    </div>
  );
}
const initialFilters = {
  search: "",
  gameType: "",
  difficulty: "",
  skillCode: "",
  criterionCode: "",
  status: "ACTIVE",
  mine: "false",
};
export function LibraryPage({ admin = false }: { admin?: boolean }) {
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
      <main className="p-8">
        <h1 className="text-xl font-bold">
          Bạn chưa có quyền truy cập kho trò chơi này.
        </h1>
        <Link href="/account" className="asset-button-secondary mt-5">
          Về tài khoản
        </Link>
      </main>
    );
  return (
    <LibraryContent
      key={session.user.userId}
      api={api}
      admin={admin}
      fullName={session.user.fullName}
      canSave={
        session.user.permissions.includes("GENERATE_GAME_CONTENT") &&
        session.user.permissions.includes("SAVE_GAMES")
      }
    />
  );
}
function LibraryContent({
  api,
  admin,
  fullName,
  canSave,
}: {
  api: GameLibraryApi;
  admin: boolean;
  fullName: string;
  canSave: boolean;
}) {
  const base = admin ? "/admin/games" : "/teacher/games";
  const [filters, setFilters] = useState(initialFilters);
  const [applied, setApplied] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [catalog, setCatalog] = useState<Skill[]>([]);
  const [data, setData] = useState<GameLibraryPage | null>(null);
  const [loaded, setLoaded] = useState<{
    api: GameLibraryApi;
    applied: typeof initialFilters;
    page: number;
    reload: number;
  } | null>(null);
  const busy =
    !loaded ||
    loaded.api !== api ||
    loaded.applied !== applied ||
    loaded.page !== page ||
    loaded.reload !== reload;
  const [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    const params = new URLSearchParams({ page: String(page), pageSize: "12" });
    Object.entries(applied).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    Promise.all([api.list(params, abort.signal), api.curriculum(abort.signal)])
      .then(([result, skills]) => {
        if (abort.signal.aborted) return;
        setData(result);
        setCatalog(skills);
        setError("");
      })
      .catch((failure) => {
        if (!abort.signal.aborted) setError(libraryError(failure));
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoaded({ api, applied, page, reload });
      });
    return () => abort.abort();
  }, [api, applied, page, reload]);
  function apply(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setApplied({ ...filters });
  }
  const criteria = catalog
    .filter(
      (skill) => !filters.skillCode || skill.skillCode === filters.skillCode,
    )
    .flatMap((skill) => skill.criterions);
  return (
    <main className="min-h-dvh bg-slate-50 px-4 py-6 text-slate-900 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-7xl">
        <nav className="mb-6 flex flex-wrap items-center justify-between gap-3 text-sm">
          <Link href="/account" className="font-bold text-indigo-700">
            ← LumiKids · Tài khoản
          </Link>
          <span className="text-slate-500">{fullName}</span>
        </nav>
        <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-700 via-indigo-600 to-sky-500 p-6 text-white shadow-sm sm:p-9">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-6 -top-8 text-[180px] leading-none text-white/10"
          >
            ✦
          </span>
          <div className="relative flex flex-wrap items-center justify-between gap-6">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-widest text-indigo-100">
                {admin ? "Không gian quản trị" : "Không gian giáo viên"} · Kho
                dùng chung
              </p>
              <h1 className="mt-3 text-3xl font-bold sm:text-4xl">
                Kho trò chơi
              </h1>
              <p className="mt-3 text-sm leading-6 text-indigo-50">
                Lưu những ý tưởng phù hợp, chọn chỉ số đánh giá và cùng chia sẻ
                học liệu trò chơi với các giáo viên.
              </p>
            </div>
            {canSave && (
              <Link
                href={`${base}/create`}
                className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-indigo-700 shadow-sm hover:bg-indigo-50"
              >
                ＋ Tạo trò chơi mới
              </Link>
            )}
          </div>
          <div className="mt-6 flex flex-wrap gap-3 text-xs font-medium">
            <span className="rounded-full bg-white/15 px-4 py-2">
              3 dạng trò chơi
            </span>
            <span className="rounded-full bg-white/15 px-4 py-2">
              Chuẩn 15–17
            </span>
            <span className="rounded-full bg-white/15 px-4 py-2">
              11 chỉ số nhận thức
            </span>
          </div>
        </header>
        <form
          onSubmit={apply}
          className="mt-6 rounded-2xl border border-slate-200 bg-white p-5"
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm font-medium">
              Tìm trò chơi
              <input
                className="asset-input mt-2"
                placeholder="Tên hoặc ghi chú…"
                value={filters.search}
                maxLength={200}
                onChange={(e) =>
                  setFilters({ ...filters, search: e.target.value })
                }
              />
            </label>
            <label className="text-sm font-medium">
              Loại trò chơi
              <select
                className="asset-input mt-2"
                value={filters.gameType}
                onChange={(e) =>
                  setFilters({ ...filters, gameType: e.target.value })
                }
              >
                <option value="">Tất cả loại</option>
                {Object.entries(gameTypeLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium">
              Độ khó
              <select
                className="asset-input mt-2"
                value={filters.difficulty}
                onChange={(e) =>
                  setFilters({ ...filters, difficulty: e.target.value })
                }
              >
                <option value="">Tất cả mức độ</option>
                {Object.entries(difficultyLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium">
              Chuẩn
              <select
                className="asset-input mt-2"
                value={filters.skillCode}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    skillCode: e.target.value,
                    criterionCode: "",
                  })
                }
              >
                <option value="">Tất cả Chuẩn</option>
                {catalog.map((skill) => (
                  <option key={skill.skillCode} value={skill.skillCode}>
                    Chuẩn {skill.skillCode} · {skill.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium">
              Chỉ số
              <select
                className="asset-input mt-2"
                value={filters.criterionCode}
                onChange={(e) =>
                  setFilters({ ...filters, criterionCode: e.target.value })
                }
              >
                <option value="">Tất cả Chỉ số</option>
                {criteria.map((c) => (
                  <option key={c.criterionCode} value={c.criterionCode}>
                    Chỉ số {c.criterionCode} · {c.description}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium">
              Trạng thái
              <select
                className="asset-input mt-2"
                value={filters.status}
                onChange={(e) =>
                  setFilters({ ...filters, status: e.target.value })
                }
              >
                <option value="ACTIVE">Đang sử dụng</option>
                <option value="ARCHIVED">
                  Đã lưu trữ{admin ? "" : " · của tôi"}
                </option>
              </select>
            </label>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={filters.mine === "true"}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    mine: e.target.checked ? "true" : "false",
                  })
                }
                className="h-4 w-4 accent-indigo-600"
              />
              Chỉ trò chơi do tôi tạo
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                className="asset-text-button"
                onClick={() => {
                  setFilters(initialFilters);
                  setApplied({ ...initialFilters });
                  setPage(1);
                }}
              >
                Đặt lại
              </button>
              <button className="asset-button-primary" type="submit">
                Áp dụng bộ lọc
              </button>
            </div>
          </div>
        </form>
        <div className="my-6 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">
            {applied.mine === "true"
              ? "Trò chơi của tôi"
              : applied.status === "ARCHIVED"
                ? "Trò chơi đã lưu trữ"
                : "Cùng khám phá và học tập"}
            {data && !busy && !error && (
              <span className="ml-2 rounded-full bg-indigo-100 px-3 py-1 text-sm text-indigo-700">
                {data.pagination.total}
              </span>
            )}
          </h2>
          <button
            className="asset-text-button"
            type="button"
            onClick={() => setReload((n) => n + 1)}
          >
            ↻ Tải lại
          </button>
        </div>
        {busy ? (
          <div
            role="status"
            className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500"
          >
            Đang mở kho trò chơi…
          </div>
        ) : error ? (
          <div role="alert" className="asset-error p-6">
            {error}
            <button
              type="button"
              className="asset-button-secondary ml-3"
              onClick={() => setReload((n) => n + 1)}
            >
              Thử lại
            </button>
          </div>
        ) : !data?.items.length ? (
          <div className="rounded-3xl border border-dashed border-indigo-200 bg-white px-6 py-16 text-center">
            <span aria-hidden="true" className="text-5xl text-indigo-300">
              ✦
            </span>
            <h3 className="mt-5 text-xl font-bold">Chưa có trò chơi phù hợp</h3>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500">
              Thử thay đổi bộ lọc hoặc tạo trò chơi mới. Sau khi chơi thử và
              chọn chỉ số, bạn có thể lưu trò vào đây.
            </p>
            {canSave && (
              <Link
                href={`${base}/create`}
                className="asset-button-primary mt-6"
              >
                Tạo trò chơi đầu tiên
              </Link>
            )}
          </div>
        ) : (
          <>
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {data.items.map((game) => (
                <article
                  className="flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md"
                  key={game.versionId}
                >
                  <Cover api={api} game={game} />
                  <div className="flex flex-1 flex-col p-5">
                    <div className="flex flex-wrap gap-2 text-xs font-semibold">
                      <span className="rounded-full bg-indigo-50 px-3 py-1 text-indigo-700">
                        {gameTypeLabels[game.gameType]}
                      </span>
                      <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-800">
                        {difficultyLabels[game.difficulty]}
                      </span>
                      {game.status === "ARCHIVED" && (
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
                          Đã lưu trữ
                        </span>
                      )}
                    </div>
                    <h3 className="mt-4 break-words text-lg font-bold leading-7">
                      <Link
                        href={`${base}/${game.versionId}`}
                        className="hover:text-indigo-700"
                      >
                        {game.name}
                      </Link>
                    </h3>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">
                      {game.description ||
                        "Trò chơi đã được người tạo duyệt và lưu vào kho chung."}
                    </p>
                    <div className="my-4 flex flex-wrap gap-2">
                      {game.criterions.map((c) => (
                        <span
                          title={c.description}
                          key={c.criterionCode}
                          className="rounded-lg border border-emerald-100 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800"
                        >
                          Chỉ số {c.criterionCode}
                        </span>
                      ))}
                    </div>
                    <div className="mt-auto border-t border-slate-100 pt-4">
                      <p className="truncate text-xs text-slate-500">
                        {game.creatorName} ·{" "}
                        {new Date(game.createdAt).toLocaleDateString("vi-VN")}
                      </p>
                      <Link
                        href={`${base}/${game.versionId}`}
                        className="asset-button-secondary mt-4 w-full"
                      >
                        Mở và chơi thử →
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <nav
              className="mt-8 flex items-center justify-center gap-4"
              aria-label="Phân trang kho trò chơi"
            >
              <button
                className="asset-button-secondary"
                disabled={page <= 1}
                onClick={() => setPage((n) => n - 1)}
              >
                ← Trước
              </button>
              <span className="text-sm font-medium">
                {page} / {data.pagination.totalPages}
              </span>
              <button
                className="asset-button-secondary"
                disabled={page >= data.pagination.totalPages}
                onClick={() => setPage((n) => n + 1)}
              >
                Sau →
              </button>
            </nav>
          </>
        )}
        <p className="mt-8 text-xs leading-5 text-slate-500">
          Chỉ số được giáo viên gắn để xác định mục tiêu. Kho chưa lưu kết quả
          chơi hoặc tự đánh giá năng lực của trẻ.
        </p>
      </div>
    </main>
  );
}
