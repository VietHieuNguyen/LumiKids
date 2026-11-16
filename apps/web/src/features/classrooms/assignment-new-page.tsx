"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { ClassroomDetail, SavedGame } from "@lumikids/shared";
import { GameSymbol } from "../game-runtime/components/game-symbol";
import { difficultyLabels, gameTypeLabels } from "../game-library/library-page";
import type { GameLibraryApi } from "../game-library/api";
import { AssignmentApi, classroomError } from "./api";
import type { ClassroomApi } from "./api";
import { ClassroomShell, ErrorBanner, Notice, Panel } from "./classroom-shell";
import { addDays, endOfLocalDay, localToday, startOfLocalDay } from "./format";
import { ChildPicker } from "./groups-panel";
import { useClassroomSession } from "./use-classroom-session";
import { useResource } from "./use-resource";

const MAX_GAMES = 10;
type Target = "CLASS" | "GROUP" | "CHILDREN";

export function AssignmentNewPage({ classId }: { classId: string }) {
  const { session, loading, api, libraryApi, allowed, canAssign } = useClassroomSession("READ_OWN_CLASSROOMS");
  if (loading || !session || !api || !libraryApi) return <Notice>Đang kiểm tra phiên đăng nhập…</Notice>;
  if (!allowed || !canAssign) return <Notice>Tài khoản này chưa được giao bài.</Notice>;
  return <NewAssignment key={`${session.user.userId}:${classId}`} api={api} libraryApi={libraryApi} classId={classId} />;
}

function NewAssignment({ api, libraryApi, classId }: { api: ClassroomApi; libraryApi: GameLibraryApi; classId: string }) {
  const classroom = useResource((signal) => api.myClassroom(classId, signal), classId);
  const back = { href: `/teacher/classrooms/${classId}`, label: classroom.data ? `Lớp ${classroom.data.className}` : "Lớp học" };
  return (
    <ClassroomShell title="Giao bài mới" eyebrow={classroom.data ? `Lớp ${classroom.data.className}` : undefined} back={back}>
      {classroom.error && <ErrorBanner message={classroom.error} onRetry={classroom.reload} />}
      {classroom.data ? <AssignmentForm api={api} libraryApi={libraryApi} classroom={classroom.data} /> : !classroom.error && <p role="status">Đang tải lớp…</p>}
    </ClassroomShell>
  );
}

function AssignmentForm({ api, libraryApi, classroom }: { api: ClassroomApi; libraryApi: GameLibraryApi; classroom: ClassroomDetail }) {
  const router = useRouter();
  const assignments = useMemo(() => new AssignmentApi(api, classroom.classId), [api, classroom.classId]);
  const groups = useResource((signal) => assignments.groups(signal), classroom.classId);
  const today = localToday();
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [games, setGames] = useState<SavedGame[]>([]);
  const [target, setTarget] = useState<Target>("CLASS");
  const [groupId, setGroupId] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [opensOn, setOpensOn] = useState(today);
  const [hasDeadline, setHasDeadline] = useState(true);
  const [dueOn, setDueOn] = useState(addDays(today, 7));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const groupList = groups.data ?? [];
  const chosenGroup = groupList.find((group) => group.groupId === (groupId || groupList[0]?.groupId));
  const recipientCount =
    target === "CLASS" ? classroom.children.length : target === "GROUP" ? (chosenGroup?.childIds.length ?? 0) : picked.size;
  const problems = [
    !title.trim() && "Đặt tên bài.",
    games.length === 0 && "Chọn ít nhất một trò.",
    recipientCount === 0 && "Chọn người nhận.",
    hasDeadline && dueOn < opensOn && "Hạn phải từ ngày mở trở đi.",
    hasDeadline && dueOn < today && "Hạn không được ở quá khứ.",
  ].filter(Boolean) as string[];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || problems.length) return;
    setBusy(true);
    setError("");
    try {
      const created = await assignments.create({
        title: title.trim(),
        note: note.trim(),
        // Opening today means "now"; a later day opens at the start of that day.
        opensAt: opensOn > today ? startOfLocalDay(opensOn) : undefined,
        dueAt: hasDeadline ? endOfLocalDay(dueOn) : null,
        versionIds: games.map((game) => game.versionId),
        target:
          target === "CLASS"
            ? { type: "CLASS" }
            : target === "GROUP"
              ? { type: "GROUP", groupId: chosenGroup?.groupId ?? "" }
              : { type: "CHILDREN", childIds: [...picked] },
      });
      router.replace(`/teacher/classrooms/${classroom.classId}/assignments/${created.assignmentId}`);
    } catch (failure) {
      setError(classroomError(failure));
      setBusy(false);
    }
  }

  return (
    <form className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]" onSubmit={submit}>
      <div className="min-w-0 space-y-6">
        <Panel title="1. Bài này là gì?">
          <div className="space-y-4">
            <div>
              <label className="asset-label" htmlFor="title">Tên bài (trẻ sẽ thấy)</label>
              <input id="title" className="asset-input mt-1 text-base" required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Đếm con vật trong rừng" />
            </div>
            <div>
              <label className="asset-label" htmlFor="note">Lời nhắn cho trẻ (không bắt buộc)</label>
              <input id="note" className="asset-input mt-1" maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Con đếm thật chậm nhé!" />
            </div>
          </div>
        </Panel>
        <GamePicker libraryApi={libraryApi} selected={games} onChange={setGames} />
      </div>
      <aside className="space-y-6 lg:sticky lg:top-20 lg:self-start">
        <Panel title="3. Giao cho ai?">
          <div className="grid grid-cols-3 gap-1 rounded-2xl border border-line bg-white p-1" role="radiogroup" aria-label="Người nhận">
            {([
              ["CLASS", "Cả lớp"],
              ["GROUP", "Một nhóm"],
              ["CHILDREN", "Chọn trẻ"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={target === value}
                onClick={() => setTarget(value)}
                className={`min-h-10 rounded-xl text-sm font-bold transition ${target === value ? "bg-ink text-white" : "text-ink-soft hover:bg-cream"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-4">
            {target === "CLASS" && <p className="text-sm text-ink-soft">{classroom.children.length} trẻ đang học lớp sẽ nhận bài. Trẻ vào lớp sau sẽ không tự nhận bài này.</p>}
            {target === "GROUP" &&
              (groupList.length === 0 ? (
                <p className="text-sm text-ink-soft">
                  Lớp chưa có nhóm. <Link className="font-semibold text-leaf underline" href={`/teacher/classrooms/${classroom.classId}?tab=groups`}>Tạo nhóm</Link>
                </p>
              ) : (
                <div>
                  <label className="asset-label" htmlFor="group">Nhóm</label>
                  <select id="group" className="asset-input mt-1" value={chosenGroup?.groupId ?? ""} onChange={(event) => setGroupId(event.target.value)}>
                    {groupList.map((group) => (
                      <option key={group.groupId} value={group.groupId}>{group.name} ({group.childIds.length} trẻ)</option>
                    ))}
                  </select>
                </div>
              ))}
            {target === "CHILDREN" && <ChildPicker options={classroom.children} picked={picked} onChange={setPicked} />}
          </div>
        </Panel>
        <Panel title="4. Khi nào?">
          <div className="space-y-4">
            <div>
              <label className="asset-label" htmlFor="opens">Ngày mở bài</label>
              <input id="opens" type="date" className="asset-input mt-1" min={today} value={opensOn} onChange={(event) => setOpensOn(event.target.value || today)} />
              <p className="mt-1 text-xs text-ink-soft">{opensOn > today ? "Trẻ thấy bài từ đầu ngày này." : "Trẻ thấy bài ngay."}</p>
            </div>
            <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
              <input type="checkbox" className="h-5 w-5 accent-[#2f8a4d]" checked={hasDeadline} onChange={(event) => setHasDeadline(event.target.checked)} />
              Có hạn chơi
            </label>
            {hasDeadline && (
              <div>
                <label className="asset-label" htmlFor="due">Hạn (hết ngày)</label>
                <input id="due" type="date" className="asset-input mt-1" min={opensOn} value={dueOn} onChange={(event) => setDueOn(event.target.value)} />
                <p className="mt-1 text-xs text-ink-soft">Sau hạn, trẻ có thể xin chơi lại; bạn duyệt và chọn hạn mới.</p>
              </div>
            )}
          </div>
        </Panel>
        <div className="rounded-3xl border border-line bg-paper p-4">
          <p className="text-sm text-ink-soft">
            <strong className="text-ink">{games.length}</strong> trò · <strong className="text-ink">{recipientCount}</strong> trẻ nhận
          </p>
          {problems.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-xs text-ink-soft">
              {problems.map((problem) => <li key={problem}>{problem}</li>)}
            </ul>
          )}
          {error && <p role="alert" className="asset-error mt-3">{error}</p>}
          <button className="lumi-button-sun mt-4 w-full text-base" disabled={busy || problems.length > 0}>
            {busy ? "Đang giao…" : "Giao bài"}
          </button>
        </div>
      </aside>
    </form>
  );
}

function GamePicker({ libraryApi, selected, onChange }: { libraryApi: GameLibraryApi; selected: SavedGame[]; onChange: (games: SavedGame[]) => void }) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  const results = useResource(
    (signal) => libraryApi.list(new URLSearchParams({ page: String(page), pageSize: "12", search: query, status: "ACTIVE" }), signal),
    `${query}:${page}`,
  );
  const chosen = new Set(selected.map((game) => game.versionId));
  function toggle(game: SavedGame) {
    if (chosen.has(game.versionId)) onChange(selected.filter((item) => item.versionId !== game.versionId));
    else if (selected.length < MAX_GAMES) onChange([...selected, game]);
  }
  return (
    <Panel title="2. Chọn trò chơi" description={`Từ kho trò chơi chung, tối đa ${MAX_GAMES} trò. Trẻ chơi theo thứ tự bạn chọn.`}>
      {selected.length > 0 && (
        <ol className="mb-4 grid gap-2">
          {selected.map((game, index) => (
            <li key={game.versionId} className="flex items-center gap-3 rounded-2xl bg-leaf-soft px-3 py-2">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-leaf text-xs font-bold text-white">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{game.name}</span>
              <button type="button" className="asset-icon-button h-8 w-8" aria-label={`Đưa ${game.name} lên`} disabled={index === 0} onClick={() => {
                const next = [...selected];
                [next[index - 1], next[index]] = [next[index] as SavedGame, next[index - 1] as SavedGame];
                onChange(next);
              }}>↑</button>
              <button type="button" className="asset-icon-button h-8 w-8" aria-label={`Bỏ ${game.name}`} onClick={() => toggle(game)}>✕</button>
            </li>
          ))}
        </ol>
      )}
      <label className="sr-only" htmlFor="game-search">Tìm trò chơi</label>
      <input id="game-search" type="search" className="asset-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo tên trò…" />
      {results.error && <ErrorBanner message={results.error} onRetry={results.reload} />}
      {results.loading && !results.data && <p role="status" className="mt-3 text-sm text-ink-soft">Đang tải kho trò chơi…</p>}
      {results.data?.items.length === 0 && <p className="mt-3 text-sm text-ink-soft">Không có trò phù hợp.</p>}
      <ul className="mt-3 grid gap-2 sm:grid-cols-2" aria-busy={results.loading}>
        {(results.data?.items ?? []).map((game) => {
          const isChosen = chosen.has(game.versionId);
          const full = !isChosen && selected.length >= MAX_GAMES;
          return (
            <li key={game.versionId}>
              <button
                type="button"
                aria-pressed={isChosen}
                disabled={full}
                onClick={() => toggle(game)}
                className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition disabled:opacity-40 ${isChosen ? "border-leaf bg-leaf-soft" : "border-line bg-white hover:border-leaf/50"}`}
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-sun-soft text-ink"><GameSymbol type={game.gameType} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{game.name}</span>
                  <span className="block text-xs text-ink-soft">{gameTypeLabels[game.gameType]} · {difficultyLabels[game.difficulty]}</span>
                </span>
                <span aria-hidden="true" className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 text-xs font-bold ${isChosen ? "border-leaf bg-leaf text-white" : "border-line"}`}>{isChosen ? "✓" : ""}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {results.data && results.data.pagination.totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between text-sm">
          <button type="button" className="asset-button-secondary" disabled={page <= 1} onClick={() => setPage((n) => n - 1)}>← Trước</button>
          <span className="tabular-nums text-ink-soft">{page}/{results.data.pagination.totalPages}</span>
          <button type="button" className="asset-button-secondary" disabled={page >= results.data.pagination.totalPages} onClick={() => setPage((n) => n + 1)}>Sau →</button>
        </div>
      )}
    </Panel>
  );
}
