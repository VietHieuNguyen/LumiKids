"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { vietnamDate } from "@lumikids/shared";
import type { AgeGroup, ClassroomDetail, SavedGame } from "@lumikids/shared";
import { GameSymbol } from "../game-runtime/components/game-symbol";
import { difficultyLabels, gameTypeLabels } from "../game-library/library-page";
import type { GameLibraryApi } from "../game-library/api";
import { AssignmentApi, classroomError } from "./api";
import type { ClassroomApi } from "./api";
import { ClassroomShell, ErrorBanner, Notice, Panel } from "./classroom-shell";
import { addDays, formatDateOnly } from "./format";
import { openingAgeBand } from "./classroom-workflow";
import { ChildPicker } from "./groups-panel";
import { useClassroomSession } from "./use-classroom-session";
import { useResource } from "./use-resource";
import { useNavigationMemory } from "./navigation-memory";

const MAX_GAMES = 10;
const steps = ["Người nhận và lịch", "Chọn trò chơi", "Kiểm tra và giao"] as const;
type Step = 0 | 1 | 2;
type Target = "CLASS" | "GROUP" | "CHILDREN";
type Draft = {
  step: Step;
  title: string;
  note: string;
  games: SavedGame[];
  target: Target;
  groupId: string;
  picked: Set<string>;
  opensOn: string;
  hasDeadline: boolean;
  dueOn: string;
};

const drafts = new Map<string, Draft>();

export function AssignmentNewPage({ classId, initialChild }: { classId: string; initialChild?: string }) {
  const { session, loading, api, libraryApi, allowed, canAssign } = useClassroomSession("READ_OWN_CLASSROOMS");
  if (loading || !session || !api || !libraryApi) return <Notice>Đang kiểm tra phiên đăng nhập…</Notice>;
  if (!allowed || !canAssign) return <Notice>Tài khoản này chưa được giao bài.</Notice>;
  return <NewAssignment key={`${session.user.userId}:${classId}:${initialChild ?? ""}`} api={api} libraryApi={libraryApi} classId={classId} initialChild={initialChild} draftKey={`${session.user.userId}:${classId}:${initialChild ?? ""}`} />;
}

function NewAssignment({ api, libraryApi, classId, initialChild, draftKey }: { api: ClassroomApi; libraryApi: GameLibraryApi; classId: string; initialChild?: string; draftKey: string }) {
  const classroom = useResource((signal) => api.myClassroom(classId, signal), classId);
  const back = { href: `/teacher/classrooms/${classId}?tab=${initialChild ? "children" : "assignments"}`, label: initialChild ? "Danh sách trẻ" : "Bài đã giao" };
  return (
    <ClassroomShell title="Giao bài mới" eyebrow={classroom.data ? `Lớp ${classroom.data.className}` : undefined} back={back}>
      {classroom.error && <ErrorBanner message={classroom.error} onRetry={classroom.reload} />}
      {classroom.data?.status === "ACTIVE" && <AssignmentForm api={api} libraryApi={libraryApi} classroom={classroom.data} initialChild={initialChild} draftKey={draftKey} />}
      {classroom.data?.status === "ARCHIVED" && <p className="text-ink-soft">Lớp đã lưu trữ.</p>}
      {!classroom.data && !classroom.error && <p role="status">Đang tải lớp…</p>}
    </ClassroomShell>
  );
}

function AssignmentForm({ api, libraryApi, classroom, initialChild, draftKey }: { api: ClassroomApi; libraryApi: GameLibraryApi; classroom: ClassroomDetail; initialChild?: string; draftKey: string }) {
  const router = useRouter();
  const heading = useRef<HTMLHeadingElement>(null);
  const assignments = useMemo(() => new AssignmentApi(api, classroom.classId), [api, classroom.classId]);
  const groups = useResource((signal) => assignments.groups(signal), classroom.classId);
  const ageGroups = useResource((signal) => libraryApi.ageGroups(signal), "assignment-age-groups");
  const today = vietnamDate(new Date()).toISOString().slice(0, 10);
  const memory = useNavigationMemory(drafts, draftKey, (): Draft => ({
    step: 0,
    title: "",
    note: "",
    games: [],
    target: initialChild ? "CHILDREN" : "CLASS",
    groupId: "",
    picked: new Set(initialChild && classroom.children.some((child) => child.childId === initialChild && child.status === "ACTIVE") ? [initialChild] : []),
    opensOn: today,
    hasDeadline: true,
    dueOn: addDays(today, 7),
  }));
  const { step, title, note, games, target, groupId, picked, opensOn, hasDeadline, dueOn } = memory.value;
  function edit(patch: Partial<Draft>) {
    memory.update((previous) => ({ ...previous, ...patch }));
  }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const chosenGroup = groups.data?.find((group) => group.groupId === groupId);
  const recipients = classroom.children.filter((child) =>
    target === "CLASS" || (target === "GROUP" ? chosenGroup?.childIds.includes(child.childId) : picked.has(child.childId)),
  );
  const band = openingAgeBand(recipients, opensOn);
  const ageGroup = ageGroups.data?.find((group) => group.minAge === band && group.maxAge === group.minAge + 1);
  const selectedGames = games.filter((game) => ageGroup && game.ageGroup?.ageGroupId === ageGroup.ageGroupId);
  const peopleProblem = !recipients.length ? "Chọn ít nhất một trẻ nhận bài."
    : opensOn < today ? "Ngày mở bài phải từ hôm nay trở đi."
    : band === "mixed" ? "Người nhận thuộc nhiều nhóm tuổi vào ngày mở bài. Hãy chọn trẻ cùng nhóm tuổi và giao bài riêng."
    : band === "unsupported" ? "Có trẻ ngoài nhóm 3–6 tuổi vào ngày mở bài."
    : hasDeadline && (!dueOn || dueOn < opensOn) ? "Chọn hạn chơi từ ngày mở bài trở đi."
    : "";
  const targetLabel = target === "CLASS" ? "Cả lớp" : target === "GROUP" ? chosenGroup?.name : "Trẻ đã chọn";

  function goTo(next: Step) {
    setError("");
    edit({ step: next });
    requestAnimationFrame(() => heading.current?.focus());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (step === 0 && !peopleProblem) { goTo(1); return; }
    if (step === 1 && selectedGames.length) { goTo(2); return; }
    if (step !== 2 || peopleProblem || !selectedGames.length || !title.trim()) return;
    setBusy(true);
    setError("");
    try {
      const created = await assignments.create({
        title: title.trim(),
        note: note.trim(),
        opensAt: opensOn > today ? new Date(`${opensOn}T00:00:00+07:00`).toISOString() : undefined,
        dueAt: hasDeadline ? new Date(`${dueOn}T23:59:59.999+07:00`).toISOString() : null,
        versionIds: selectedGames.map((game) => game.versionId),
        target: target === "CLASS" ? { type: "CLASS" }
          : target === "GROUP" && chosenGroup ? { type: "GROUP", groupId: chosenGroup.groupId }
          : { type: "CHILDREN", childIds: recipients.map((child) => child.childId) },
      });
      memory.forget();
      router.replace(`/teacher/classrooms/${classroom.classId}/assignments/${created.assignmentId}`);
    } catch (failure) {
      setError(classroomError(failure));
      setBusy(false);
    }
  }

  return (
    <form className="mx-auto max-w-4xl" onSubmit={submit}>
      <ol aria-label="Các bước giao bài" className="mb-5 grid gap-2 sm:grid-cols-3">
        {steps.map((label, index) => (
          <li key={label} aria-current={step === index ? "step" : undefined} className={`min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${step === index ? "flex border-leaf bg-leaf-soft text-leaf" : "hidden border-line bg-paper text-ink-soft sm:flex"}`}>
            <span className="tabular-nums">{index + 1}/3</span> {label}
          </li>
        ))}
      </ol>
      <h2 ref={heading} tabIndex={-1} className="sr-only">{steps[step]}</h2>
      {step === 0 && <Panel title="Người nhận và lịch mở bài">
        <fieldset>
          <legend className="asset-label">Ai sẽ nhận bài?</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {([["CLASS", "Cả lớp"], ["GROUP", "Một nhóm"], ["CHILDREN", "Chọn từng trẻ"]] as const).map(([value, label]) => (
              <label key={value} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-semibold ${target === value ? "border-leaf bg-leaf-soft" : "border-line bg-white"}`}>
                <input type="radio" name="recipients" value={value} checked={target === value} onChange={() => edit({ target: value })} className="accent-leaf" /> {label}
              </label>
            ))}
          </div>
          <div className="mt-3">
            {target === "GROUP" && (groups.error ? <ErrorBanner message={groups.error} onRetry={groups.reload} /> : !groups.data ? <p role="status">Đang tải nhóm…</p> : groups.data.length === 0 ? (
              <p className="text-sm text-ink-soft">Lớp chưa có nhóm. <Link className="font-semibold text-leaf underline" href={`/teacher/classrooms/${classroom.classId}?tab=groups`}>Mở quản lý nhóm</Link></p>
            ) : (
              <div>
                <label className="asset-label" htmlFor="assignment-group">Nhóm nhận bài</label>
                <select id="assignment-group" className="asset-input mt-1" value={groupId} onChange={(event) => edit({ groupId: event.target.value })}>
                  <option value="">Chọn nhóm</option>
                  {groups.data.map((group) => <option key={group.groupId} value={group.groupId}>{group.name} ({group.childIds.length} trẻ)</option>)}
                </select>
              </div>
            ))}
            {target === "CHILDREN" && <ChildPicker options={classroom.children} picked={picked} onChange={(value) => edit({ picked: value })} />}
            <p className="mt-2 text-sm text-ink-soft">{recipients.length} trẻ sẽ nhận bài.</p>
          </div>
        </fieldset>
        <div className="mt-5 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
          <div>
            <label className="asset-label" htmlFor="assignment-opens">Ngày mở bài</label>
            <input id="assignment-opens" type="date" className="asset-input mt-1" min={today} value={opensOn} onChange={(event) => edit({ opensOn: event.target.value || today })} />
            <p className="mt-1 text-sm text-ink-soft">{opensOn === today ? "Mở ngay sau khi giao." : "Mở từ đầu ngày theo giờ Việt Nam."}</p>
          </div>
          <div>
            <label className="flex min-h-8 items-center gap-2 text-sm font-semibold"><input type="checkbox" className="accent-leaf" checked={hasDeadline} onChange={(event) => edit({ hasDeadline: event.target.checked })} /> Có hạn chơi</label>
            {hasDeadline && <>
              <label className="asset-label" htmlFor="assignment-due">Hạn chơi (hết ngày)</label>
              <input id="assignment-due" type="date" className="asset-input mt-1" min={opensOn} value={dueOn} onChange={(event) => edit({ dueOn: event.target.value })} />
            </>}
          </div>
        </div>
        {peopleProblem && <p role="status" className="mt-4 rounded-xl bg-sun-soft p-3 text-sm text-ink">{peopleProblem}</p>}
      </Panel>}
      {step === 1 && (ageGroup ? (
        <GamePicker key={ageGroup.ageGroupId} libraryApi={libraryApi} ageGroup={ageGroup} selected={selectedGames} onChange={(value) => edit({ games: value })} />
      ) : <Panel title="Chọn trò chơi">{ageGroups.error ? <ErrorBanner message={ageGroups.error} onRetry={ageGroups.reload} /> : <p role="status">{ageGroups.loading ? "Đang tải nhóm tuổi…" : "Chưa có nhóm tuổi phù hợp trong kho trò chơi."}</p>}</Panel>)}
      {step === 2 && <Panel title="Kiểm tra bài trước khi giao">
        <div className="space-y-4">
          <div>
            <label className="asset-label" htmlFor="title">Tên bài</label>
            <input id="title" className="asset-input mt-1" required maxLength={200} disabled={busy} value={title} onChange={(event) => edit({ title: event.target.value })} />
          </div>
          <div>
            <label className="asset-label" htmlFor="note">Lời nhắn cho trẻ (không bắt buộc)</label>
            <textarea id="note" className="asset-input mt-1 min-h-20" maxLength={1000} disabled={busy} value={note} onChange={(event) => edit({ note: event.target.value })} />
          </div>
          <dl className="grid gap-3 rounded-xl bg-leaf-soft/60 p-4 text-sm sm:grid-cols-3">
            <div><dt className="text-ink-soft">Người nhận</dt><dd className="font-semibold">{targetLabel} · {recipients.length} trẻ</dd></div>
            <div><dt className="text-ink-soft">Mở bài</dt><dd className="font-semibold">{opensOn === today ? "Mở ngay" : formatDateOnly(opensOn)}</dd></div>
            <div><dt className="text-ink-soft">Hạn chơi</dt><dd className="font-semibold">{hasDeadline ? formatDateOnly(dueOn) : "Không đặt hạn"}</dd></div>
          </dl>
          {target !== "CLASS" && <p className="break-words text-sm text-ink-soft">{recipients.map((child) => child.fullName).join(", ")}</p>}
          <h3 className="font-semibold">Thứ tự trò chơi</h3>
          <ol className="list-decimal space-y-1 pl-5 text-sm">{selectedGames.map((game) => <li key={game.versionId} className="break-words">{game.name}</li>)}</ol>
          {peopleProblem && <ErrorBanner message={peopleProblem} />}
          {error && <ErrorBanner message={error} />}
        </div>
      </Panel>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-paper p-3">
        {step > 0 ? <button type="button" className="asset-button-secondary" disabled={busy} onClick={() => goTo(step === 2 ? 1 : 0)}>Quay lại</button> : <span />}
        {step === 1 && <p role="status" className="text-sm text-ink-soft">Đã chọn {selectedGames.length}/{MAX_GAMES} trò</p>}
        <button className="asset-button-primary" disabled={busy || (step === 0 ? !!peopleProblem : !selectedGames.length || (step === 2 && (!title.trim() || !!peopleProblem)))}>
          {busy ? "Đang giao…" : step === 0 ? "Tiếp tục chọn trò" : step === 1 ? "Kiểm tra bài" : "Giao bài"}
        </button>
      </div>
    </form>
  );
}

function GamePicker({ libraryApi, ageGroup, selected, onChange }: { libraryApi: GameLibraryApi; ageGroup: AgeGroup; selected: SavedGame[]; onChange: (games: SavedGame[]) => void }) {
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
    (signal) => libraryApi.list(new URLSearchParams({ page: String(page), pageSize: "12", search: query, status: "ACTIVE", ageGroupId: ageGroup.ageGroupId }), signal),
    `${query}:${page}`,
  );
  const chosen = new Set(selected.map((game) => game.versionId));
  function toggle(game: SavedGame) {
    if (chosen.has(game.versionId)) onChange(selected.filter((item) => item.versionId !== game.versionId));
    else if (selected.length < MAX_GAMES) onChange([...selected, game]);
  }
  return (
    <Panel title="Chọn trò chơi" description={`Trò dành cho trẻ ${ageGroup.minAge}–${ageGroup.maxAge} tuổi. Chọn tối đa ${MAX_GAMES} trò.`}>
      {selected.length > 0 && (
        <ol className="mb-4 grid gap-2">
          {selected.map((game, index) => (
            <li key={game.versionId} className="flex items-center gap-3 rounded-2xl bg-leaf-soft px-3 py-2">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-leaf text-xs font-bold text-white">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{game.name}</span>
              <button type="button" className="asset-icon-button !h-11 !w-11" aria-label={`Đưa ${game.name} lên`} disabled={index === 0} onClick={() => {
                const next = [...selected];
                [next[index - 1], next[index]] = [next[index] as SavedGame, next[index - 1] as SavedGame];
                onChange(next);
              }}>↑</button>
              <button type="button" className="asset-icon-button !h-11 !w-11" aria-label={`Bỏ ${game.name}`} onClick={() => toggle(game)}>✕</button>
            </li>
          ))}
        </ol>
      )}
      <label className="asset-label" htmlFor="game-search">Tìm trò chơi</label>
      <input id="game-search" type="search" className="asset-input mt-1" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo tên trò…" />
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
