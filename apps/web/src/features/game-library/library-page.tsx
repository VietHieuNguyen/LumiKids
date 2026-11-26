"use client";
/* eslint-disable @next/next/no-img-element -- Private, short-lived API URLs are loaded directly. */
import Link from "next/link";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { AgeGroup, GameLibraryPage, SavedGame, Skill } from "@lumikids/shared";
import { StaffPage } from "@/components/staff-shell";
import { Notice } from "../classrooms/classroom-shell";
import { LibraryIcon as Icon } from "./library-icon";
import { GameLibraryApi, libraryError } from "./api";
import { useLibrarySession } from "./use-library-session";

export const gameTypeLabels = {
  COUNTING: "Đếm số lượng",
  MATCHING: "Ghép cặp",
  CLASSIFICATION: "Phân loại",
  QUANTITY: "Tách / Gộp",
  PATTERN: "Sắp xếp theo quy tắc",
};
export const difficultyLabels = {
  EASY: "Dễ",
  MEDIUM: "Trung bình",
  HARD: "Khó",
};
const typeStyles = {
  COUNTING: { cover: "bg-sky", badge: "bg-sky text-[#245b73]" },
  MATCHING: { cover: "bg-leaf-soft", badge: "bg-leaf-soft text-[#27633b]" },
  CLASSIFICATION: { cover: "bg-sun-soft", badge: "bg-sun-soft text-[#805b13]" },
  QUANTITY: { cover: "bg-amber-50", badge: "bg-amber-50 text-amber-900" },
  PATTERN: { cover: "bg-[#f4ecfb]", badge: "bg-[#f4ecfb] text-[#5d4380]" },
};
function Cover({ api, game }: { api: GameLibraryApi; game: SavedGame }) {
  const [images, setImages] = useState<{ id: string; url: string }[]>([]);
  useEffect(() => {
    let current = true;
    void Promise.allSettled(
      game.coverAssetIds.slice(0, 3).map(async (id) => ({
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
      className={`library-cover relative flex h-44 items-center justify-center gap-3 overflow-hidden px-7 ${typeStyles[game.gameType].cover}`}
      aria-hidden="true"
    >
      <span className="absolute -right-8 -top-14 h-40 w-40 rounded-full border-[20px] border-white/35" />
      <span className="absolute -bottom-10 -left-4 h-24 w-24 rounded-full bg-white/30" />
      {images.length ? (
        images.map((image, index) => (
          <div
            className={`relative flex h-24 min-w-0 max-w-28 flex-1 items-center justify-center rounded-2xl border-2 border-white bg-white/90 p-2 shadow-sm ${index % 2 ? "rotate-3" : "-rotate-3"}`}
            key={image.id}
          >
            <img
              src={image.url}
              alt=""
              className="h-full w-full object-contain"
              onError={() => setImages((current) => current.filter((item) => item.id !== image.id))}
            />
          </div>
        ))
      ) : (
        <div className="relative flex items-center gap-4 text-ink/65">
          <span className="grid h-24 w-24 -rotate-3 place-items-center rounded-3xl border-2 border-white bg-paper/90 shadow-sm"><Icon name={game.gameType} className="h-12 w-12" /></span>
          <span className="font-display text-2xl font-bold">{gameTypeLabels[game.gameType]}</span>
        </div>
      )}
    </div>
  );
}
const initialFilters = {
  search: "",
  gameType: "",
  difficulty: "",
  ageGroupId: "",
  skillCode: "",
  criterionCode: "",
  status: "ACTIVE",
  mine: "false",
};
export function LibraryPage({ admin = false }: { admin?: boolean }) {
  const { session, loading, api } = useLibrarySession();
  if (loading || !session || !api)
    return (
      <Notice>
        Đang kiểm tra phiên đăng nhập…
      </Notice>
    );
  if (
    !session.user.permissions.includes("READ_GAMES") ||
    (admin && !session.user.permissions.includes("MANAGE_ALL_GAMES"))
  )
    return (
      <Notice>
        <h1 className="text-xl font-bold">
          Bạn chưa có quyền truy cập kho trò chơi này.
        </h1>
        <Link href="/account" className="asset-button-secondary mt-5">
          Về tài khoản
        </Link>
      </Notice>
    );
  return (
    <LibraryContent
      key={session.user.userId}
      api={api}
      admin={admin}
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
  canSave,
}: {
  api: GameLibraryApi;
  admin: boolean;
  canSave: boolean;
}) {
  const base = admin ? "/admin/games" : "/teacher/games";
  const [filters, setFilters] = useState(initialFilters);
  const [applied, setApplied] = useState(initialFilters);
  const [advanced, setAdvanced] = useState(false);
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [catalog, setCatalog] = useState<Skill[]>([]);
  const [ageGroups, setAgeGroups] = useState<AgeGroup[]>([]);
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
    Promise.all([api.list(params, abort.signal), api.curriculum(abort.signal), api.ageGroups(abort.signal)])
      .then(([result, skills, groups]) => {
        if (abort.signal.aborted) return;
        setData(result);
        setCatalog(skills);
        setAgeGroups(groups);
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
  const advancedCount = Number(Boolean(filters.skillCode)) + Number(Boolean(filters.criterionCode)) + Number(filters.status !== "ACTIVE");
  const activeLabels = [
    applied.search && `Tìm: ${applied.search}`,
    gameTypeLabels[applied.gameType as keyof typeof gameTypeLabels],
    applied.difficulty && `Độ khó: ${difficultyLabels[applied.difficulty as keyof typeof difficultyLabels]}`,
    applied.ageGroupId && (ageGroups.find((group) => group.ageGroupId === applied.ageGroupId)?.name ?? applied.ageGroupId),
    applied.skillCode && `Chuẩn ${applied.skillCode}`,
    applied.criterionCode && `Chỉ số ${applied.criterionCode}`,
    applied.status === "ARCHIVED" && "Đã lưu trữ",
    applied.mine === "true" && "Do tôi tạo",
  ].filter(Boolean);
  function reset() {
    setFilters(initialFilters);
    setApplied({ ...initialFilters });
    setPage(1);
  }
  return (
    <StaffPage>
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-7 sm:px-6 sm:pt-9">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-5">
          <div className="min-w-0">
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-leaf">{admin ? "Quản trị" : "Giáo viên"} · Học liệu dùng chung</p>
            <h1 className="font-display text-4xl font-extrabold leading-tight text-ink">Kho trò chơi</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-soft">Tìm ý tưởng, chơi thử và chọn trò chơi phù hợp cho giờ học của bé.</p>
          </div>
          {canSave && <Link href={`${base}/create`} className="lumi-button-sun"><Icon name="plus" />Tạo trò chơi mới</Link>}
        </header>
        <aside className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-leaf/15 bg-leaf-soft/60 px-5 py-4" aria-label="Thông tin kho trò chơi">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-paper text-leaf"><Icon name="book" className="h-6 w-6" /></span>
            <div><p className="font-display text-lg font-bold">Cùng tạo nên những giờ học thú vị</p><p className="mt-0.5 text-xs leading-5 text-ink-soft">Trò chơi được giáo viên duyệt và gắn mục tiêu đánh giá.</p></div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold text-ink-soft">
            <span className="rounded-lg border border-line bg-paper/80 px-3 py-2">3 dạng trò chơi</span>
            {catalog.length > 0 && <span className="rounded-lg border border-line bg-paper/80 px-3 py-2">{catalog.reduce((sum, skill) => sum + skill.criterions.length, 0)} chỉ số đánh giá</span>}
          </div>
        </aside>
        <form
          onSubmit={apply}
          className="rounded-3xl border border-line bg-paper p-4 shadow-sm sm:p-5"
          aria-label="Bộ lọc trò chơi"
        >
          <div className="mb-4 flex items-center gap-2"><Icon name="search" className="h-4 w-4 text-leaf" /><h2 className="text-sm font-bold">Tìm trò chơi phù hợp</h2></div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
            <label className="asset-label sm:col-span-2 lg:col-span-1">
              <span id="library-search-label">Tìm trò chơi</span>
              <input
                aria-labelledby="library-search-label"
                className="asset-input mt-2"
                type="search"
                placeholder="Nhập tên hoặc ghi chú…"
                value={filters.search}
                maxLength={200}
                onChange={(e) =>
                  setFilters({ ...filters, search: e.target.value })
                }
              />
            </label>
            <label className="asset-label">
              <span id="library-type-label">Loại trò chơi</span>
              <select
                aria-labelledby="library-type-label"
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
            <label className="asset-label">
              <span id="library-difficulty-label">Độ khó</span>
              <select
                aria-labelledby="library-difficulty-label"
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
            <label className="asset-label">
              <span id="library-age-label">Nhóm tuổi</span>
              <select
                aria-labelledby="library-age-label"
                className="asset-input mt-2"
                value={filters.ageGroupId}
                onChange={(e) =>
                  setFilters({ ...filters, ageGroupId: e.target.value })
                }
              >
                <option value="">Mọi nhóm tuổi</option>
                {ageGroups.map((group) => (
                  <option key={group.ageGroupId} value={group.ageGroupId}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div id="library-advanced-filters" hidden={!advanced} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="asset-label">
              <span id="library-skill-label">Chuẩn</span>
              <select
                aria-labelledby="library-skill-label"
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
                <option value="">Tất cả chuẩn</option>
                {catalog.map((skill) => (
                  <option key={skill.skillCode} value={skill.skillCode}>
                    Chuẩn {skill.skillCode} · {skill.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="asset-label">
              <span id="library-criterion-label">Chỉ số</span>
              <select
                aria-labelledby="library-criterion-label"
                className="asset-input mt-2"
                value={filters.criterionCode}
                onChange={(e) =>
                  setFilters({ ...filters, criterionCode: e.target.value })
                }
              >
                <option value="">Tất cả chỉ số</option>
                {criteria.map((c) => (
                  <option key={c.criterionCode} value={c.criterionCode}>
                    Chỉ số {c.criterionCode} · {c.description}
                  </option>
                ))}
              </select>
            </label>
            <label className="asset-label">
              <span id="library-status-label">Trạng thái</span>
              <select
                aria-labelledby="library-status-label"
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
          <div className="mt-5 flex flex-wrap items-center justify-between gap-x-5 gap-y-3 border-t border-line pt-4">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <button type="button" aria-expanded={advanced} aria-controls="library-advanced-filters" className="inline-flex min-h-10 items-center gap-2 rounded-lg text-sm font-semibold text-ink-soft hover:text-ink" onClick={() => setAdvanced((value) => !value)}>
                <Icon name="filter" className="h-4 w-4" />Bộ lọc thêm{advancedCount > 0 && <span className="rounded-full bg-leaf-soft px-2 text-xs text-leaf">{advancedCount}</span>}<span aria-hidden="true">{advanced ? "−" : "+"}</span>
              </button>
              <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-ink-soft">
                <input
                  type="checkbox"
                  checked={filters.mine === "true"}
                  onChange={(e) =>
                    setFilters({
                      ...filters,
                      mine: e.target.checked ? "true" : "false",
                    })
                  }
                  className="h-4 w-4 accent-leaf"
                />
                Chỉ trò chơi do tôi tạo
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                className="asset-text-button"
                onClick={reset}
              >
                Đặt lại
              </button>
              <button className="asset-button-primary" type="submit">
                <Icon name="search" className="h-4 w-4" />Áp dụng bộ lọc
              </button>
            </div>
          </div>
        </form>
        <section className="mt-7" aria-labelledby="library-results-heading" aria-busy={busy}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 id="library-results-heading" className="font-display text-2xl font-bold">
              {applied.mine === "true"
                ? "Trò chơi của tôi"
                : applied.status === "ARCHIVED"
                  ? "Trò chơi đã lưu trữ"
                  : "Danh sách trò chơi"}
              {data && !busy && !error && (
                <span className="ml-2 rounded-full bg-leaf-soft px-2.5 py-1 font-sans text-sm text-leaf">
                  {data.pagination.total}
                </span>
              )}
            </h2>
            <button
              className="asset-button-secondary"
              type="button"
              disabled={busy}
              onClick={() => setReload((n) => n + 1)}
            >
              <Icon name="refresh" className="h-4 w-4" /><span className="hidden sm:inline">Tải lại</span><span className="sr-only sm:hidden">Tải lại danh sách</span>
            </button>
          </div>
          {activeLabels.length > 0 && <div className="mb-4 flex flex-wrap items-center gap-2" aria-label="Bộ lọc đang áp dụng">{activeLabels.map((label, index) => <span key={index} className="max-w-full break-words rounded-lg border border-line bg-paper px-3 py-1.5 text-xs text-ink-soft">{label}</span>)}<button type="button" className="asset-text-button px-2 text-xs" onClick={reset}>Xóa bộ lọc</button></div>}
          {busy ? (
            <div
              role="status"
              className="rounded-3xl border border-line bg-paper p-12 text-center text-sm text-ink-soft"
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
            <div className="rounded-3xl border border-dashed border-ink/20 bg-paper px-6 py-12 text-center">
              <span className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-sun-soft text-ink-soft">
                <Icon name={activeLabels.length ? "search" : "book"} className="h-8 w-8" />
              </span>
              <h3 className="mt-4 font-display text-2xl font-bold">{activeLabels.length ? "Chưa có trò chơi phù hợp" : "Kho trò chơi đang chờ ý tưởng đầu tiên"}</h3>
              <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-ink-soft">
                {activeLabels.length ? "Thử thay đổi từ khóa hoặc bỏ bớt bộ lọc để tìm trò chơi khác." : canSave ? "Tạo nội dung, chơi thử và chọn chỉ số đánh giá để lưu trò chơi vào kho dùng chung." : "Các trò chơi sẽ xuất hiện tại đây khi được tạo và lưu vào kho dùng chung."}
              </p>
              {activeLabels.length > 0 && <button type="button" className="asset-button-secondary mt-5 mr-3" onClick={reset}>Xóa bộ lọc</button>}
              {canSave && (
                <Link
                  href={`${base}/create`}
                  className="lumi-button-sun mt-5"
                >
                  <Icon name="plus" className="h-4 w-4" />Tạo trò chơi mới
                </Link>
              )}
            </div>
          ) : (
            <>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {data.items.map((game) => (
                  <article
                    className="flex min-w-0 flex-col overflow-hidden rounded-3xl border border-line bg-paper shadow-sm transition-shadow hover:shadow-md"
                    key={game.versionId}
                  >
                    <Cover api={api} game={game} />
                    <div className="flex flex-1 flex-col p-5">
                      <div className="flex flex-wrap gap-2 text-xs font-semibold">
                        <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 ${typeStyles[game.gameType].badge}`}>
                          <Icon name={game.gameType} className="h-3.5 w-3.5" />{gameTypeLabels[game.gameType]}
                        </span>
                        <span className="rounded-lg bg-ink/5 px-2.5 py-1.5 text-ink-soft">
                          {difficultyLabels[game.difficulty]}
                        </span>
                        <span className={`rounded-lg px-2.5 py-1.5 ${game.ageGroup ? "bg-leaf-soft text-leaf" : "bg-sun-soft text-[#8a5a00]"}`}>
                          {game.ageGroup?.name ?? "Chưa chọn nhóm tuổi"}
                        </span>
                        {game.status === "ARCHIVED" && (
                          <span className="rounded-lg border border-line px-2.5 py-1.5 text-ink-soft">
                            Đã lưu trữ
                          </span>
                        )}
                      </div>
                      <h3 className="mt-3 break-words font-display text-xl font-bold leading-7">
                        <Link
                          href={`${base}/${game.versionId}`}
                          className="rounded hover:text-leaf"
                        >
                          {game.name}
                        </Link>
                      </h3>
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-ink-soft">
                        {game.description ||
                          "Trò chơi đã được người tạo duyệt và lưu vào kho chung."}
                      </p>
                      <div className="my-4 flex flex-wrap gap-2">
                        {game.criterions.map((c) => (
                          <span
                            title={c.description}
                            key={c.criterionCode}
                            className="rounded-md border border-leaf/20 px-2 py-1 text-xs font-medium text-leaf"
                          >
                            Chỉ số {c.criterionCode}
                          </span>
                        ))}
                      </div>
                      <div className="mt-auto border-t border-line pt-4">
                        <p className="truncate text-xs text-ink-soft">
                          {game.creatorName} ·{" "}
                          {new Date(game.createdAt).toLocaleDateString("vi-VN")}
                        </p>
                        <Link
                          href={`${base}/${game.versionId}`}
                          className="asset-button-secondary mt-3 w-full"
                          aria-label={`Xem và chơi thử: ${game.name}`}
                        >
                          Xem và chơi thử<Icon name="arrow" className="h-4 w-4" />
                        </Link>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              {data.pagination.totalPages > 1 && <nav
                className="mt-7 flex items-center justify-center gap-4"
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
              </nav>}
            </>
          )}
        </section>
        <p className="mt-7 max-w-3xl text-xs leading-5 text-ink-soft">
          Chỉ số giúp giáo viên xác định mục tiêu học tập. Việc gắn chỉ số vào trò
          chơi không thay thế đánh giá năng lực của trẻ.
        </p>
      </main>
    </StaffPage>
  );
}
