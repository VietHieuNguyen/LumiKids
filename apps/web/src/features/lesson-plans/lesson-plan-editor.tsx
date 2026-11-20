"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LessonBlock, LessonPlan, LessonPlanStatus, SavedGame } from "@lumikids/shared";
import { MAX_LESSON_BLOCKS } from "@lumikids/shared";
import { ClassroomApiError, classroomError } from "../classrooms/api";
import type { ClassroomApi } from "../classrooms/api";
import { ClassroomShell, Dialog, ErrorBanner, Notice, Panel, StatusPill } from "../classrooms/classroom-shell";
import { formatDateTime } from "../classrooms/format";
import { useClassroomSession } from "../classrooms/use-classroom-session";
import { useResource } from "../classrooms/use-resource";
import type { GameLibraryApi } from "../game-library/api";
import { difficultyLabels, gameTypeLabels } from "../game-library/library-page";
import { LessonPlanApi, lessonStatusLabels, lessonStatusTones } from "./api";

export function LessonPlanEditorPage({ lessonPlanId }: { lessonPlanId: string }) {
  const { session, loading, api, libraryApi, allowed } = useClassroomSession("MANAGE_LESSON_PLANS");
  if (loading || !session || !api || !libraryApi) return <Notice>Đang kiểm tra phiên đăng nhập…</Notice>;
  if (!allowed) return <Notice>Tài khoản này chưa soạn được giáo án.</Notice>;
  return <Loader key={`${session.user.userId}:${lessonPlanId}`} api={api} library={libraryApi} lessonPlanId={lessonPlanId} />;
}

function Loader({ api, library, lessonPlanId }: { api: ClassroomApi; library: GameLibraryApi; lessonPlanId: string }) {
  const plans = useMemo(() => new LessonPlanApi(api), [api]);
  const plan = useResource((signal) => plans.detail(lessonPlanId, signal), lessonPlanId);
  const back = { href: "/teacher/lesson-plans", label: "Giáo án" };
  if (!plan.data)
    return (
      <ClassroomShell title="Giáo án" back={back}>
        {plan.error ? <ErrorBanner message={plan.error} onRetry={plan.reload} /> : <p role="status">Đang tải…</p>}
      </ClassroomShell>
    );
  // A reload after a conflict remounts the editor on the newest revision.
  return <Editor key={plan.data.revision} plans={plans} library={library} initial={plan.data} onReload={plan.reload} onSaved={plan.replace} />;
}

type GameRef = NonNullable<LessonBlock["game"]>;
interface DraftBlock {
  key: string;
  title: string;
  instruction: string;
  durationMinutes: string;
  game: GameRef | null;
}
interface Draft {
  title: string;
  topic: string;
  ageGroupId: string;
  skillCode: string;
  durationMinutes: string;
  objectives: string;
  preparation: string;
  evaluation: string;
  blocks: DraftBlock[];
}

let keySeed = 0;
const newKey = () => `new-${++keySeed}`;
function draftOf(plan: LessonPlan): Draft {
  return {
    title: plan.title,
    topic: plan.topic,
    ageGroupId: plan.ageGroupId ?? "",
    skillCode: plan.skillCode ?? "",
    durationMinutes: plan.durationMinutes ? String(plan.durationMinutes) : "",
    objectives: plan.objectives,
    preparation: plan.preparation,
    evaluation: plan.evaluation,
    blocks: plan.blocks.map((block) => ({
      key: block.blockId,
      title: block.title,
      instruction: block.instruction,
      durationMinutes: block.durationMinutes ? String(block.durationMinutes) : "",
      game: block.game,
    })),
  };
}
const minutesOf = (value: string) => (value.trim() ? Number(value) : null);
function sameDraft(a: Draft, b: Draft) {
  const strip = (draft: Draft) => ({ ...draft, blocks: draft.blocks.map((block) => [block.title, block.instruction, block.durationMinutes, block.game?.versionId ?? null]) });
  return JSON.stringify(strip(a)) === JSON.stringify(strip(b));
}
/** What COMPLETE requires (the API checks the same). */
function missingForComplete(draft: Draft): string[] {
  const missing: string[] = [];
  if (!draft.objectives.trim()) missing.push("mục tiêu");
  if (!draft.preparation.trim()) missing.push("chuẩn bị");
  if (!draft.blocks.length) missing.push("ít nhất một hoạt động");
  if (!draft.evaluation.trim()) missing.push("đánh giá");
  return missing;
}

function Editor({ plans, library, initial, onReload, onSaved }: { plans: LessonPlanApi; library: GameLibraryApi; initial: LessonPlan; onReload: () => void; onSaved: (plan: LessonPlan) => void }) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(() => draftOf(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState("");
  const [picking, setPicking] = useState<string | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const groups = useResource((signal) => library.ageGroups(signal), "age-groups");
  const skills = useResource((signal) => library.curriculum(signal), "curriculum");
  const dirty = !sameDraft(draft, draftOf(saved));
  const missing = missingForComplete(draft);
  const lastFocus = useRef<string | null>(null);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    // Keep focus on the moved block's handle after a keyboard move.
    if (!lastFocus.current) return;
    document.querySelector<HTMLButtonElement>(`[data-move="${lastFocus.current}"]`)?.focus();
    lastFocus.current = null;
  });

  const set = <K extends keyof Draft>(field: K, value: Draft[K]) => setDraft((current) => ({ ...current, [field]: value }));
  const setBlock = (key: string, patch: Partial<DraftBlock>) =>
    setDraft((current) => ({ ...current, blocks: current.blocks.map((block) => (block.key === key ? { ...block, ...patch } : block)) }));
  function move(key: string, to: number, viaKeyboard = false) {
    setDraft((current) => {
      const from = current.blocks.findIndex((block) => block.key === key);
      if (from < 0 || to < 0 || to >= current.blocks.length || from === to) return current;
      const blocks = [...current.blocks];
      const [block] = blocks.splice(from, 1);
      blocks.splice(to, 0, block);
      setAnnouncement(`Đã chuyển “${block.title || "hoạt động"}” tới vị trí ${to + 1}/${blocks.length}.`);
      return { ...current, blocks };
    });
    if (viaKeyboard) lastFocus.current = key;
  }
  function addBlock() {
    if (draft.blocks.length >= MAX_LESSON_BLOCKS) return;
    set("blocks", [...draft.blocks, { key: newKey(), title: "", instruction: "", durationMinutes: "", game: null }]);
  }

  async function save(status: LessonPlanStatus) {
    if (busy) return;
    if (status === "COMPLETE" && missing.length) {
      setError(`Để hoàn thành, cần điền ${missing.join(", ")}.`);
      return;
    }
    const untitled = draft.blocks.findIndex((block) => !block.title.trim());
    if (untitled >= 0) {
      setError(`Hoạt động ${untitled + 1} chưa có tên.`);
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await plans.save(saved.lessonPlanId, {
        title: draft.title.trim(),
        topic: draft.topic.trim(),
        ageGroupId: draft.ageGroupId || null,
        skillCode: draft.skillCode || null,
        durationMinutes: minutesOf(draft.durationMinutes),
        objectives: draft.objectives,
        preparation: draft.preparation,
        evaluation: draft.evaluation,
        blocks: draft.blocks.map((block) => ({
          title: block.title.trim(),
          instruction: block.instruction,
          durationMinutes: minutesOf(block.durationMinutes),
          versionId: block.game?.versionId ?? null,
        })),
        status,
        revision: saved.revision,
      });
      setSaved(result);
      setDraft(draftOf(result));
      setNotice(status === "COMPLETE" ? "Đã lưu và đánh dấu hoàn thành." : "Đã lưu bản nháp.");
      onSaved(result);
    } catch (failure) {
      if (failure instanceof ClassroomApiError && failure.code === "LESSON_PLAN_CONFLICT") setConflict(true);
      else setError(classroomError(failure));
    } finally {
      setBusy(false);
    }
  }

  const totalBlockMinutes = draft.blocks.reduce((sum, block) => sum + (Number(block.durationMinutes) || 0), 0);
  const pickingBlock = draft.blocks.find((block) => block.key === picking);
  return (
    <ClassroomShell
      title={draft.title.trim() || "Giáo án"}
      eyebrow="Giáo án"
      back={{ href: "/teacher/lesson-plans", label: "Giáo án" }}
      actions={
        <>
          <StatusPill tone={lessonStatusTones[saved.status]}>{lessonStatusLabels[saved.status]}</StatusPill>
          <button type="button" className="asset-button-secondary" disabled={busy || conflict || !draft.title.trim()} onClick={() => void save("DRAFT")}>
            {busy ? "Đang lưu…" : saved.status === "COMPLETE" ? "Chuyển về nháp" : "Lưu nháp"}
          </button>
          <button type="button" className="lumi-button-sun" disabled={busy || conflict || !draft.title.trim()} onClick={() => void save("COMPLETE")} title={missing.length ? `Còn thiếu: ${missing.join(", ")}` : undefined}>
            {saved.status === "COMPLETE" ? "Lưu" : "Hoàn thành"}
          </button>
        </>
      }
    >
      <p className="-mt-3 mb-5 text-xs text-ink-soft" role="status" aria-live="polite">
        {dirty ? "Có thay đổi chưa lưu." : `Đã lưu · ${saved.updatedByName} · ${formatDateTime(saved.updatedAt)}`}
        {notice && !dirty ? ` · ${notice}` : ""}
      </p>
      {conflict && (
        <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sun-edge/50 bg-sun-soft p-4 text-sm text-[#805b13]">
          <span>Giáo án vừa được lưu ở một nơi khác (tab hoặc máy khác). Tải bản mới nhất để tiếp tục; thay đổi chưa lưu ở đây sẽ mất.</span>
          <button type="button" className="asset-button-secondary" onClick={onReload}>Tải bản mới nhất</button>
        </div>
      )}
      {error && <ErrorBanner message={error} />}
      <span className="sr-only" aria-live="assertive">{announcement}</span>
      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <Panel title="Thông tin chung">
            <div className="space-y-4">
              <label className="asset-label block">
                Tên giáo án
                <input className="asset-input mt-1" required maxLength={200} value={draft.title} onChange={(event) => set("title", event.target.value)} />
              </label>
              <label className="asset-label block">
                Chủ đề
                <input className="asset-input mt-1" maxLength={200} value={draft.topic} onChange={(event) => set("topic", event.target.value)} />
              </label>
              <label className="asset-label block">
                Nhóm tuổi
                <select className="asset-input mt-1" value={draft.ageGroupId} onChange={(event) => set("ageGroupId", event.target.value)}>
                  <option value="">Chưa chọn</option>
                  {groups.data?.map((group) => <option key={group.ageGroupId} value={group.ageGroupId}>{group.name}</option>)}
                </select>
              </label>
              <label className="asset-label block">
                Chuẩn phát triển
                <select className="asset-input mt-1" value={draft.skillCode} onChange={(event) => set("skillCode", event.target.value)}>
                  <option value="">Chưa chọn</option>
                  {skills.data?.map((skill) => <option key={skill.skillCode} value={skill.skillCode}>Chuẩn {skill.skillCode} · {skill.name}</option>)}
                </select>
              </label>
              <label className="asset-label block">
                Thời lượng (phút)
                <input type="number" inputMode="numeric" min={1} max={480} className="asset-input mt-1" value={draft.durationMinutes} onChange={(event) => set("durationMinutes", event.target.value)} />
                {totalBlockMinutes > 0 && <span className="mt-1 block text-xs font-normal text-ink-soft">Các hoạt động cộng lại: {totalBlockMinutes} phút</span>}
              </label>
            </div>
          </Panel>
          <nav aria-label="Các mục của giáo án" className="hidden rounded-3xl border border-line bg-paper p-4 text-sm lg:block">
            <ol className="space-y-1">
              {[
                ["plan-objectives", "1. Mục tiêu", draft.objectives.trim()],
                ["plan-preparation", "2. Chuẩn bị", draft.preparation.trim()],
                ["plan-activities", `3. Tiến trình (${draft.blocks.length})`, draft.blocks.length],
                ["plan-evaluation", "4. Đánh giá", draft.evaluation.trim()],
              ].map(([href, label, done]) => (
                <li key={String(href)}>
                  <a className="flex min-h-9 items-center justify-between rounded-lg px-2 font-medium hover:bg-cream" href={`#${href}`}>
                    {label}
                    <span aria-hidden="true" className={done ? "text-leaf" : "text-ink-soft/50"}>{done ? "✓" : "○"}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>
        <div className="min-w-0 space-y-6">
          <SectionText id="plan-objectives" title="1. Mục tiêu" hint="Trẻ biết, làm được gì sau hoạt động (kiến thức, kĩ năng, thái độ)." value={draft.objectives} onChange={(value) => set("objectives", value)} />
          <SectionText id="plan-preparation" title="2. Chuẩn bị" hint="Đồ dùng của cô và trẻ, không gian, học liệu, trò chơi cần mở trước." value={draft.preparation} onChange={(value) => set("preparation", value)} />
          <section id="plan-activities" className="scroll-mt-6 rounded-3xl border border-line bg-paper p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-bold">3. Tiến trình hoạt động</h2>
                <p className="mt-1 text-sm text-ink-soft">Kéo tay cầm ⠿ hoặc dùng nút ↑ ↓ để đổi thứ tự. Có thể gắn một trò chơi trong kho cho mỗi hoạt động.</p>
              </div>
              <span className="text-xs tabular-nums text-ink-soft">{draft.blocks.length}/{MAX_LESSON_BLOCKS}</span>
            </div>
            {draft.blocks.length === 0 && <p className="mt-4 rounded-2xl border border-dashed border-line p-5 text-center text-sm text-ink-soft">Chưa có hoạt động. Thêm hoạt động mở đầu, hoạt động chính và kết thúc.</p>}
            <ol className="mt-4 space-y-3">
              {draft.blocks.map((block, index) => (
                <li
                  key={block.key}
                  onDragOver={(event) => {
                    if (!dragKey) return;
                    event.preventDefault();
                    if (dropKey !== block.key) setDropKey(block.key);
                  }}
                  onDragLeave={() => setDropKey((current) => (current === block.key ? null : current))}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (dragKey) move(dragKey, index);
                    setDragKey(null);
                    setDropKey(null);
                  }}
                  className={`rounded-2xl border bg-white p-4 transition ${dragKey === block.key ? "opacity-50" : ""} ${dropKey === block.key && dragKey !== block.key ? "border-leaf ring-2 ring-leaf/30" : "border-line"}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex shrink-0 flex-col items-center gap-1">
                      <span
                        draggable
                        onDragStart={(event) => {
                          setDragKey(block.key);
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", block.key);
                        }}
                        onDragEnd={() => {
                          setDragKey(null);
                          setDropKey(null);
                        }}
                        className="grid h-9 w-9 cursor-grab place-items-center rounded-lg text-lg text-ink-soft hover:bg-cream active:cursor-grabbing"
                        aria-hidden="true"
                        title="Kéo để đổi thứ tự"
                      >
                        ⠿
                      </span>
                      <span className="grid h-7 w-7 place-items-center rounded-full bg-leaf-soft text-xs font-bold text-leaf" aria-hidden="true">{index + 1}</span>
                    </div>
                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
                        <label className="asset-label block">
                          <span className="sr-only">Hoạt động {index + 1}: </span>Tên hoạt động
                          <input className="asset-input mt-1" maxLength={200} placeholder="Ví dụ: Trò chuyện về khu vườn" value={block.title} onChange={(event) => setBlock(block.key, { title: event.target.value })} />
                        </label>
                        <label className="asset-label block">
                          Phút
                          <input type="number" inputMode="numeric" min={1} max={240} className="asset-input mt-1" value={block.durationMinutes} onChange={(event) => setBlock(block.key, { durationMinutes: event.target.value })} />
                        </label>
                      </div>
                      <label className="asset-label block">
                        Cách tổ chức
                        <textarea className="asset-input mt-1" rows={3} maxLength={4000} placeholder="Cô làm gì, trẻ làm gì, câu hỏi gợi mở…" value={block.instruction} onChange={(event) => setBlock(block.key, { instruction: event.target.value })} />
                      </label>
                      {block.game ? (
                        <div className={`flex flex-wrap items-center justify-between gap-2 rounded-xl p-3 text-sm ${block.game.available ? "bg-leaf-soft" : "bg-sun-soft text-[#805b13]"}`}>
                          <span className="min-w-0">
                            <span className="block break-words font-semibold"><span className="text-xs font-bold uppercase tracking-wide text-leaf">Trò chơi · </span>{block.game.name}</span>
                            <span className="text-xs">{gameTypeLabels[block.game.gameType]}{block.game.available ? "" : " · đã gỡ khỏi kho, nên thay trò khác"}</span>
                          </span>
                          <span className="flex gap-2">
                            {block.game.available && <Link className="asset-text-button" href={`/teacher/games/${block.game.versionId}`} target="_blank">Xem</Link>}
                            <button type="button" className="asset-text-button" onClick={() => setPicking(block.key)}>Đổi</button>
                            <button type="button" className="asset-text-button" onClick={() => setBlock(block.key, { game: null })}>Bỏ</button>
                          </span>
                        </div>
                      ) : (
                        <button type="button" className="asset-button-secondary" onClick={() => setPicking(block.key)}>+ Gắn trò chơi</button>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      <button type="button" data-move={block.key} className="asset-icon-button" disabled={index === 0} onClick={() => move(block.key, index - 1, true)} aria-label={`Chuyển hoạt động ${index + 1} lên`}>↑</button>
                      <button type="button" className="asset-icon-button" disabled={index === draft.blocks.length - 1} onClick={() => move(block.key, index + 1, true)} aria-label={`Chuyển hoạt động ${index + 1} xuống`}>↓</button>
                      <button
                        type="button"
                        className="asset-icon-button text-berry"
                        onClick={() => {
                          if (block.title.trim() || block.instruction.trim() ? window.confirm(`Xóa hoạt động “${block.title || index + 1}”?`) : true)
                            set("blocks", draft.blocks.filter((entry) => entry.key !== block.key));
                        }}
                        aria-label={`Xóa hoạt động ${index + 1}`}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            <button type="button" className="asset-button-secondary mt-4 w-full" onClick={addBlock} disabled={draft.blocks.length >= MAX_LESSON_BLOCKS}>
              + Thêm hoạt động
            </button>
          </section>
          <SectionText id="plan-evaluation" title="4. Đánh giá" hint="Quan sát gì ở trẻ, tiêu chí đánh giá, điều chỉnh cho lần sau." value={draft.evaluation} onChange={(value) => set("evaluation", value)} />
        </div>
      </div>
      {pickingBlock && (
        <GamePickerDialog
          library={library}
          ageGroupId={draft.ageGroupId}
          onClose={() => setPicking(null)}
          onPick={(game) => {
            setBlock(pickingBlock.key, { game: { versionId: game.versionId, name: game.name, gameType: game.gameType, available: true }, title: pickingBlock.title || game.name });
            setPicking(null);
          }}
        />
      )}
    </ClassroomShell>
  );
}

function SectionText({ id, title, hint, value, onChange }: { id: string; title: string; hint: string; value: string; onChange: (value: string) => void }) {
  return (
    <section id={id} className="scroll-mt-6 rounded-3xl border border-line bg-paper p-5 shadow-sm sm:p-6">
      <label className="block">
        <span className="font-display text-xl font-bold">{title}</span>
        <span className="mt-1 block text-sm text-ink-soft">{hint}</span>
        <textarea className="asset-input mt-3" rows={4} maxLength={4000} value={value} onChange={(event) => onChange(event.target.value)} />
      </label>
    </section>
  );
}

/** Active games of the library, narrowed to the plan's age group when one is chosen. */
function GamePickerDialog({ library, ageGroupId, onClose, onPick }: { library: GameLibraryApi; ageGroupId: string; onClose: () => void; onPick: (game: SavedGame) => void }) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [onlyAge, setOnlyAge] = useState(Boolean(ageGroupId));
  const params = new URLSearchParams({ page: "1", pageSize: "48", status: "ACTIVE" });
  if (query) params.set("search", query);
  if (onlyAge && ageGroupId) params.set("ageGroupId", ageGroupId);
  const games = useResource((signal) => library.list(params, signal), params.toString());
  return (
    <Dialog title="Gắn trò chơi" onClose={onClose} wide>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="lesson-game-search">Tìm trò chơi</label>
          <input id="lesson-game-search" className="asset-input min-w-0 flex-1" placeholder="Tìm theo tên trò…" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") setQuery(search.trim()); }} />
          <button type="button" className="asset-button-secondary" onClick={() => setQuery(search.trim())}>Tìm</button>
        </div>
        {ageGroupId && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-leaf" checked={onlyAge} onChange={(event) => setOnlyAge(event.target.checked)} />
            Chỉ trò đúng nhóm tuổi của giáo án
          </label>
        )}
        {games.error && <ErrorBanner message={games.error} onRetry={games.reload} />}
        {!games.data && !games.error && <p role="status" className="text-sm">Đang tải kho…</p>}
        {games.data?.items.length === 0 && <p className="text-sm text-ink-soft">Không có trò phù hợp.</p>}
        {games.data && games.data.items.length > 0 && (
          <ul className="grid max-h-96 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
            {games.data.items.map((game) => (
              <li key={game.versionId}>
                <button type="button" className="flex min-h-16 w-full flex-col items-start rounded-2xl border border-line bg-white p-3 text-left text-sm hover:border-leaf hover:bg-leaf-soft" onClick={() => onPick(game)}>
                  <span className="break-words font-semibold">{game.name}</span>
                  <span className="text-xs text-ink-soft">
                    {gameTypeLabels[game.gameType]} · {difficultyLabels[game.difficulty]}{game.ageGroup ? ` · ${game.ageGroup.name}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
