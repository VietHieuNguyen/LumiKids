"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { ageGroupAccepts, ageInMonths, vietnamDate } from "@lumikids/shared";
import type { AgeGroup, FamilyActivity, FamilyChild, SavedGame } from "@lumikids/shared";
import { classroomError } from "../classrooms/api";
import type { ClassroomApi } from "../classrooms/api";
import { ClassroomShell, Dialog, ErrorBanner, Notice, Panel, StatusPill } from "../classrooms/classroom-shell";
import { ageInYears, formatDate, formatDateOnly, formatDateTime, genderLabels, localToday } from "../classrooms/format";
import { LoginCodeDialog } from "../classrooms/login-code-dialog";
import { PlayHistoryTable } from "../classrooms/play-history-table";
import { useClassroomSession } from "../classrooms/use-classroom-session";
import { useResource } from "../classrooms/use-resource";
import type { GameLibraryApi } from "../game-library/api";
import { difficultyLabels, gameTypeLabels } from "../game-library/library-page";
import { FamilyApi } from "./api";
import { ChildFormDialog } from "./child-form-dialog";
import { childPlace } from "./family-home-page";

export function FamilyChildPage({ childId }: { childId: string }) {
  const { session, loading, api, libraryApi, allowed } = useClassroomSession("MANAGE_FAMILY");
  if (loading || !session || !api || !libraryApi) return <Notice>Đang kiểm tra phiên đăng nhập…</Notice>;
  if (!allowed) return <Notice>Khu vực này dành cho phụ huynh.</Notice>;
  return <ChildDetail key={`${session.user.userId}:${childId}`} api={api} library={libraryApi} childId={childId} />;
}

const activityTones = { OPEN: "green", CLOSED: "amber", CANCELLED: "slate" } as const;
const activityLabels = { OPEN: "Đang mở", CLOSED: "Đã hết hạn", CANCELLED: "Đã hủy" } as const;

function ChildDetail({ api, library, childId }: { api: ClassroomApi; library: GameLibraryApi; childId: string }) {
  const family = useMemo(() => new FamilyApi(api), [api]);
  // The list is small (a family's children); the detail is one entry of it.
  const children = useResource((signal) => family.children(signal), "family-children");
  const child = children.data?.find((entry) => entry.childId === childId) ?? null;
  const atHome = Boolean(child && !child.currentClass);
  const activities = useResource(atHome ? (signal) => family.activities(childId, signal) : null, `activities:${childId}`);
  const [page, setPage] = useState(1);
  const history = useResource((signal) => family.playHistory(childId, page, signal), `${childId}:${page}`);
  const [dialog, setDialog] = useState<"edit" | "code" | "pick" | null>(null);
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const back = { href: "/family", label: "Con của tôi" };

  const replaceChild = (next: FamilyChild) => {
    if (children.data) children.replace(children.data.map((entry) => (entry.childId === next.childId ? next : entry)));
  };

  if (!child)
    return (
      <ClassroomShell title="Hồ sơ của con" back={back}>
        {children.error ? (
          <ErrorBanner message={children.error} onRetry={children.reload} />
        ) : children.data ? (
          <Notice>Không tìm thấy hồ sơ này trong gia đình của bạn.</Notice>
        ) : (
          <p role="status">Đang tải…</p>
        )}
      </ClassroomShell>
    );

  async function leave(current: FamilyChild) {
    if (busy || !current.currentClass) return;
    if (!window.confirm(`Cho ${current.fullName} rời lớp ${current.currentClass.className}? Giáo viên sẽ không xem được kết quả của con nữa và con chơi lại ở nhà.`)) return;
    setBusy(true);
    setActionError("");
    try {
      replaceChild(await family.leaveClass(current.childId));
    } catch (failure) {
      setActionError(classroomError(failure));
    } finally {
      setBusy(false);
    }
  }
  async function cancel(activity: FamilyActivity) {
    if (busy || !window.confirm(`Hủy “${activity.title}”? Con sẽ không mở được các trò này nữa.`)) return;
    setBusy(true);
    setActionError("");
    try {
      await family.cancelActivity(childId, activity.assignmentId);
      activities.reload();
    } catch (failure) {
      setActionError(classroomError(failure));
    } finally {
      setBusy(false);
    }
  }

  const place = childPlace(child);
  const age = ageInYears(child.dob, localToday());
  const pending = child.joinRequests.filter((request) => request.status === "PENDING");
  return (
    <ClassroomShell
      title={child.fullName}
      eyebrow="Gia đình"
      back={back}
      actions={
        <>
          <StatusPill tone={place.tone}>{place.label}</StatusPill>
          <button type="button" className="asset-button-secondary" onClick={() => setDialog("edit")} disabled={Boolean(child.currentClass)} title={child.currentClass ? "Hồ sơ do lớp học quản lý" : undefined}>
            Sửa hồ sơ
          </button>
          {atHome && (
            <button type="button" className="asset-button-primary" onClick={() => setDialog("code")}>
              {child.loginCodeIssuedAt ? "Cấp mã mới" : "Cấp mã cho con"}
            </button>
          )}
        </>
      }
    >
      {actionError && <ErrorBanner message={actionError} />}
      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-6">
          <Panel title="Thông tin">
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-ink-soft">Ngày sinh</dt>
                <dd className="font-medium">{formatDateOnly(child.dob)}{age === null ? "" : ` (${age} tuổi)`}</dd>
              </div>
              <div>
                <dt className="text-ink-soft">Giới tính</dt>
                <dd className="font-medium">{genderLabels[child.gender]}</dd>
              </div>
              <div>
                <dt className="text-ink-soft">Mã đăng nhập</dt>
                <dd className="font-medium">
                  {child.currentClass ? "Giáo viên của lớp cấp mã" : child.loginCodeIssuedAt ? `Cấp lúc ${formatDateTime(child.loginCodeIssuedAt)}` : "Chưa có mã"}
                </dd>
              </div>
            </dl>
          </Panel>
          <Panel title="Lớp học">
            {child.currentClass ? (
              <div className="space-y-3 text-sm">
                <p>
                  <span className="block font-semibold">Lớp {child.currentClass.className}</span>
                  <span className="text-ink-soft">{child.currentClass.schoolYearName} · {child.currentClass.ageGroupName} · từ {formatDate(child.currentClass.since)}</span>
                </p>
                <p className="leading-6 text-ink-soft">Giáo viên giao bài và cấp mã cho con. Trò chọn ở nhà tạm dừng khi con học lớp.</p>
                {child.currentClass.viaGuardianConsent ? (
                  <button type="button" className="asset-button-secondary w-full" disabled={busy} onClick={() => void leave(child)}>
                    Rời lớp và rút đồng ý chia sẻ
                  </button>
                ) : (
                  <p className="text-xs text-ink-soft">Con được nhà trường xếp lớp; liên hệ nhà trường để chuyển lớp.</p>
                )}
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                {pending.length > 0 ? (
                  pending.map((request) => (
                    <p key={request.requestId} className="rounded-2xl bg-sun-soft p-3 text-[#8a5a00]">
                      Đang chờ giáo viên lớp <strong>{request.className}</strong> duyệt (gửi {formatDate(request.requestedAt)}).
                    </p>
                  ))
                ) : (
                  <p className="leading-6 text-ink-soft">Con chưa vào lớp nào. Khi có mã mời của giáo viên, bạn có thể xin cho con vào lớp.</p>
                )}
                <Link className="asset-button-secondary w-full" href={`/family/join?child=${child.childId}`}>Nhập mã mời</Link>
              </div>
            )}
            {child.joinRequests.some((request) => request.status === "REJECTED") && (
              <ul className="mt-3 space-y-1 text-xs text-ink-soft">
                {child.joinRequests
                  .filter((request) => request.status === "REJECTED")
                  .map((request) => (
                    <li key={request.requestId}>Lớp {request.className}: chưa được duyệt{request.decidedAt ? ` (${formatDate(request.decidedAt)})` : ""}.</li>
                  ))}
              </ul>
            )}
          </Panel>
        </aside>
        <div className="min-w-0 space-y-6">
          {atHome && (
            <Panel
              title="Trò chơi ở nhà"
              description="Trò bạn chọn trong kho, đúng nhóm tuổi của con. Con chơi bằng mã của mình; mỗi lượt chơi xong được chấm điểm như ở lớp."
              actions={<button type="button" className="lumi-button-sun" onClick={() => setDialog("pick")}>Chọn trò cho con</button>}
            >
              {activities.error && <ErrorBanner message={activities.error} onRetry={activities.reload} />}
              {!activities.data && !activities.error && <p role="status" className="text-sm">Đang tải…</p>}
              {activities.data?.length === 0 && <p className="text-sm text-ink-soft">Chưa chọn trò nào. Bấm “Chọn trò cho con” để bắt đầu.</p>}
              {activities.data && activities.data.length > 0 && (
                <ul className="divide-y divide-line">
                  {activities.data.map((activity) => (
                    <li key={activity.assignmentId} className="py-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="break-words font-semibold">{activity.title}</p>
                          <p className="text-xs text-ink-soft">
                            Từ {formatDate(activity.opensAt)}{activity.dueAt ? ` · hạn ${formatDate(activity.dueAt)}` : ""} · {activity.games.filter((game) => game.completed).length}/{activity.games.length} trò đã xong
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusPill tone={activityTones[activity.state]}>{activityLabels[activity.state]}</StatusPill>
                          {activity.state === "OPEN" && (
                            <button type="button" className="asset-text-button" disabled={busy} onClick={() => void cancel(activity)}>Hủy</button>
                          )}
                        </div>
                      </div>
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {activity.games.map((game) => (
                          <li key={game.versionId} className={`rounded-md px-2 py-1 text-xs font-medium ${game.completed ? "bg-leaf-soft text-leaf" : "bg-ink/5 text-ink-soft"}`}>
                            {game.completed ? "✓ " : ""}{game.name}{game.available ? "" : " (đã gỡ khỏi kho)"}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}
          <Panel title="Kết quả chơi" description="Mọi lượt chơi của con, ở nhà và ở lớp. Điểm tính khi con chơi xong một trò; lượt bỏ dở không chấm.">
            {history.error && <ErrorBanner message={history.error} onRetry={history.reload} />}
            {history.data?.pagination.total === 0 && <p className="text-sm text-ink-soft">Con chưa chơi trò nào.</p>}
            {history.data && <PlayHistoryTable data={history.data} loading={history.loading} page={page} onPage={setPage} />}
          </Panel>
        </div>
      </div>
      {dialog === "edit" && (
        <ChildFormDialog
          family={family}
          child={child}
          onClose={() => setDialog(null)}
          onSaved={(next) => {
            setDialog(null);
            replaceChild(next);
          }}
        />
      )}
      {dialog === "code" && (
        <LoginCodeDialog
          className=""
          issue={() => family.issueLoginCode(child.childId)}
          child={child}
          onClose={() => setDialog(null)}
          onIssued={(issued) => replaceChild({ ...child, loginCodeIssuedAt: issued.issuedAt })}
        />
      )}
      {dialog === "pick" && (
        <PickGamesDialog
          family={family}
          library={library}
          child={child}
          onClose={() => setDialog(null)}
          onCreated={() => {
            setDialog(null);
            activities.reload();
          }}
        />
      )}
    </ClassroomShell>
  );
}

/** Up to 10 active games of the child's age group (R-01), with an optional due date. */
function PickGamesDialog({ family, library, child, onClose, onCreated }: { family: FamilyApi; library: GameLibraryApi; child: FamilyChild; onClose: () => void; onCreated: () => void }) {
  const groups = useResource((signal) => library.ageGroups(signal), "age-groups");
  const months = ageInMonths(child.dob, vietnamDate(new Date()));
  const group: AgeGroup | undefined = groups.data?.find((entry) => ageGroupAccepts(entry, months));
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const games = useResource(
    group
      ? (signal) =>
          library.list(new URLSearchParams({ page: "1", pageSize: "48", status: "ACTIVE", ageGroupId: group.ageGroupId, ...(query ? { search: query } : {}) }), signal)
      : null,
    `${group?.ageGroupId ?? ""}:${query}`,
  );
  const [picked, setPicked] = useState<SavedGame[]>([]);
  const [title, setTitle] = useState(`Trò chơi của ${child.fullName.trim().split(/\s+/).pop() ?? "con"}`);
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const toggle = (game: SavedGame) =>
    setPicked((current) => (current.some((entry) => entry.versionId === game.versionId) ? current.filter((entry) => entry.versionId !== game.versionId) : current.length >= 10 ? current : [...current, game]));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !picked.length) return;
    setBusy(true);
    setError("");
    try {
      await family.createActivity(child.childId, {
        title: title.trim(),
        versionIds: picked.map((game) => game.versionId),
        dueAt: due ? new Date(`${due}T23:59:59+07:00`).toISOString() : null,
      });
      onCreated();
    } catch (failure) {
      setError(classroomError(failure));
      setBusy(false);
    }
  }
  return (
    <Dialog title="Chọn trò cho con" onClose={onClose} wide>
      <form className="space-y-4" onSubmit={submit}>
        {groups.error && <ErrorBanner message={groups.error} onRetry={groups.reload} />}
        {groups.data && !group && (
          <p className="rounded-2xl bg-sun-soft p-3 text-sm text-[#8a5a00]">Tuổi của con ({Math.floor(months / 12)} tuổi {months % 12} tháng) chưa thuộc nhóm tuổi nào của kho trò chơi.</p>
        )}
        {group && (
          <>
            <p className="text-sm text-ink-soft">Chỉ hiện trò nhóm <strong className="text-ink">{group.name}</strong>, hợp với tuổi của con hôm nay.</p>
            <div className="flex gap-2">
              <label className="sr-only" htmlFor="pick-search">Tìm trò chơi</label>
              <input id="pick-search" className="asset-input" placeholder="Tìm theo tên trò…" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); setQuery(search.trim()); } }} />
              <button type="button" className="asset-button-secondary shrink-0" onClick={() => setQuery(search.trim())}>Tìm</button>
            </div>
            {games.error && <p role="alert" className="asset-error">{games.error}</p>}
            {!games.data && !games.error && <p role="status" className="text-sm">Đang tải kho…</p>}
            {games.data?.items.length === 0 && <p className="text-sm text-ink-soft">Chưa có trò nào cho nhóm tuổi này{query ? " khớp với từ tìm kiếm" : ""}.</p>}
            {games.data && games.data.items.length > 0 && (
              <ul className="grid max-h-80 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                {games.data.items.map((game) => {
                  const selected = picked.some((entry) => entry.versionId === game.versionId);
                  return (
                    <li key={game.versionId}>
                      <label className={`flex min-h-16 cursor-pointer items-start gap-3 rounded-2xl border p-3 text-sm ${selected ? "border-leaf bg-leaf-soft" : "border-line bg-white hover:bg-cream"}`}>
                        <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-leaf" checked={selected} disabled={!selected && picked.length >= 10} onChange={() => toggle(game)} />
                        <span className="min-w-0">
                          <span className="block break-words font-semibold">{game.name}</span>
                          <span className="text-xs text-ink-soft">{gameTypeLabels[game.gameType]} · {difficultyLabels[game.difficulty]}</span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="text-sm font-medium text-leaf" role="status">{picked.length ? `Đã chọn ${picked.length}/10 trò.` : "Chưa chọn trò nào."}</p>
            <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
              <div>
                <label className="asset-label" htmlFor="pick-title">Tên lượt chơi</label>
                <input id="pick-title" className="asset-input mt-1" required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} />
              </div>
              <div>
                <label className="asset-label" htmlFor="pick-due">Hạn (tùy chọn)</label>
                <input id="pick-due" type="date" className="asset-input mt-1" min={localToday()} value={due} onChange={(event) => setDue(event.target.value)} />
              </div>
            </div>
          </>
        )}
        {error && <p role="alert" className="asset-error">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="asset-button-secondary" onClick={onClose} disabled={busy}>Hủy</button>
          <button className="asset-button-primary" disabled={busy || !picked.length || !title.trim()}>{busy ? "Đang lưu…" : "Giao cho con"}</button>
        </div>
      </form>
    </Dialog>
  );
}
