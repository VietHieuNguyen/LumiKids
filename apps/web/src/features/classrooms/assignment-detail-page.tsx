"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { vietnamDate } from "@lumikids/shared";
import type { AssignmentDetail } from "@lumikids/shared";
import { GameSymbol } from "../game-runtime/components/game-symbol";
import { gameTypeLabels } from "../game-library/library-page";
import { AssignmentApi, classroomError } from "./api";
import { childNameMatches } from "./classroom-workflow";
import type { ClassroomApi, ClassroomScope } from "./api";
import { ClassroomShell, ErrorBanner, Notice, Panel, StatusPill } from "./classroom-shell";
import {
  addDays,
  assignmentStateLabels,
  assignmentStateTones,
  completionLabels,
  endOfLocalDay,
  formatDateOnly,
  formatDateTime,
  localToday,
  toLocalDateInput,
} from "./format";
import { useClassroomSession } from "./use-classroom-session";
import { useResource } from "./use-resource";

export function AssignmentDetailPage({ classId, assignmentId }: { classId: string; assignmentId: string }) {
  const { session, loading, api, allowed, canAssign } = useClassroomSession("READ_OWN_CLASSROOMS");
  if (loading || !session || !api) return <Notice>Đang kiểm tra phiên đăng nhập…</Notice>;
  if (!allowed) return <Notice>Tài khoản này không phụ trách lớp học.</Notice>;
  return <Detail key={`${session.user.userId}:${assignmentId}`} api={api} scope="teacher" classId={classId} assignmentId={assignmentId} canAssign={canAssign} />;
}

/** Admin, read-only: progress of an assignment a teacher gave to the class. */
export function AdminAssignmentDetailPage({ classId, assignmentId }: { classId: string; assignmentId: string }) {
  const { session, loading, api, allowed } = useClassroomSession("MANAGE_CLASSROOMS");
  if (loading || !session || !api) return <Notice>Đang kiểm tra phiên đăng nhập…</Notice>;
  if (!allowed) return <Notice>Bạn chưa có quyền quản lý lớp học.</Notice>;
  return <Detail key={`${session.user.userId}:${assignmentId}`} api={api} scope="admin" classId={classId} assignmentId={assignmentId} canAssign={false} />;
}

function useMutation() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (failure) {
      setError(classroomError(failure));
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}

const completionTones = { NOT_STARTED: "slate", IN_PROGRESS: "blue", COMPLETED: "green" } as const;

function Detail({
  api,
  scope,
  classId,
  assignmentId,
  canAssign,
}: {
  api: ClassroomApi;
  scope: ClassroomScope;
  classId: string;
  assignmentId: string;
  canAssign: boolean;
}) {
  const assignments = useMemo(() => new AssignmentApi(api, classId, scope), [api, classId, scope]);
  const detail = useResource((signal) => assignments.detail(assignmentId, signal), assignmentId);
  const back = { href: `/${scope}/classrooms/${classId}?tab=assignments`, label: "Bài đã giao" };
  if (!detail.data)
    return (
      <ClassroomShell title="Bài giao" back={back}>
        {detail.error ? <ErrorBanner message={detail.error} onRetry={detail.reload} /> : <p role="status" className="text-ink-soft">Đang tải bài…</p>}
      </ClassroomShell>
    );
  const data = detail.data;
  const editable = scope === "teacher" && canAssign && data.state !== "CANCELLED";
  return (
    <ClassroomShell
      title={data.title}
      eyebrow={`${data.targetLabel} · giao bởi ${data.createdByName}`}
      back={back}
      actions={<StatusPill tone={assignmentStateTones[data.state]}>{assignmentStateLabels[data.state]}</StatusPill>}
    >
      {detail.error && <ErrorBanner message={detail.error} onRetry={detail.reload} />}
      <div className="admin-classroom-columns grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <ReplayRequests api={assignments} detail={data} editable={editable} onChange={detail.replace} />
          <Recipients api={assignments} classId={classId} detail={data} editable={editable} onChange={detail.replace} />
        </div>
        <aside className="space-y-6">
          <Summary detail={data} />
          {editable && <Settings api={assignments} detail={data} onChange={detail.replace} />}
        </aside>
      </div>
    </ClassroomShell>
  );
}

function Summary({ detail }: { detail: AssignmentDetail }) {
  const percent = detail.recipientCount ? Math.round((detail.completedCount / detail.recipientCount) * 100) : 0;
  return (
    <Panel title="Tổng quan">
      <div className="flex items-end gap-2">
        <span className="font-display text-5xl font-extrabold leading-none tabular-nums">{detail.completedCount}</span>
        <span className="pb-1 text-sm font-semibold text-ink-soft">/ {detail.recipientCount} trẻ hoàn thành</span>
      </div>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-ink/8"><div className="h-full rounded-full bg-leaf" style={{ width: `${percent}%` }} /></div>
      <dl className="mt-5 space-y-2 text-sm">
        <div className="flex justify-between gap-3"><dt className="text-ink-soft">Mở</dt><dd className="font-semibold">{formatDateTime(detail.opensAt)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-ink-soft">Hạn</dt><dd className="font-semibold">{detail.dueAt ? formatDateTime(detail.dueAt) : "Không hạn"}</dd></div>
      </dl>
      {detail.note && <p className="mt-4 rounded-2xl bg-sun-soft p-3 text-sm">“{detail.note}”</p>}
      <h3 className="mt-5 text-sm font-bold">Trò chơi</h3>
      <ol className="mt-2 space-y-2">
        {detail.games.map((game, index) => (
          <li key={game.versionId} className="flex items-center gap-3 rounded-2xl border border-line bg-white p-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sun-soft"><GameSymbol type={game.gameType} /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{index + 1}. {game.name}</span>
              <span className="block text-xs text-ink-soft">{gameTypeLabels[game.gameType]}{game.available ? "" : " · đã lưu trữ, trẻ không mở được"}</span>
            </span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function ReplayRequests({ api, detail, editable, onChange }: { api: AssignmentApi; detail: AssignmentDetail; editable: boolean; onChange: (value: AssignmentDetail) => void }) {
  const pending = detail.recipients.filter((recipient) => recipient.pendingReplay);
  const [until, setUntil] = useState(() => addDays(localToday(), 3));
  const mutation = useMutation();
  if (!pending.length) return null;
  return (
    <section className="rounded-3xl border border-sun-edge/40 bg-sun-soft p-4 sm:p-6">
      <h2 className="font-display text-xl font-bold">Trẻ xin chơi lại ({pending.length})</h2>
      <p className="mt-1 text-sm text-ink-soft">Đồng ý thì trẻ được chơi đến hết ngày bạn chọn; các lượt chơi đó vẫn được tính.</p>
      {editable && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <label className="font-semibold" htmlFor="replay-until">Cho chơi đến hết ngày</label>
          <input id="replay-until" type="date" className="asset-input w-auto" min={localToday()} value={until} onChange={(event) => setUntil(event.target.value)} />
        </div>
      )}
      <ul className="mt-3 grid gap-2">
        {pending.map((recipient) => (
          <li key={recipient.childId} className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-3">
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{recipient.fullName}</span>
              <span className="block text-xs text-ink-soft">Gửi lúc {formatDateTime(recipient.pendingReplay?.requestedAt ?? "")} · {completionLabels[recipient.completionStatus]}</span>
            </span>
            {editable && (
              <div className="flex gap-2">
                <button type="button" className="asset-button-secondary" disabled={mutation.busy} onClick={() => void mutation.run(async () => onChange(await api.decide(detail.assignmentId, recipient.pendingReplay?.requestId ?? "", { approve: false })))}>
                  Từ chối
                </button>
                <button type="button" className="asset-button-primary" disabled={mutation.busy || !until} onClick={() => void mutation.run(async () => onChange(await api.decide(detail.assignmentId, recipient.pendingReplay?.requestId ?? "", { approve: true, until: endOfLocalDay(until) })))}>
                  Đồng ý
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {mutation.error && <p role="alert" className="asset-error mt-3">{mutation.error}</p>}
    </section>
  );
}

function Recipients({
  api,
  classId,
  detail,
  editable,
  onChange,
}: {
  api: AssignmentApi;
  classId: string;
  detail: AssignmentDetail;
  editable: boolean;
  onChange: (value: AssignmentDetail) => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const today = vietnamDate(new Date()).toISOString().slice(0, 10);
  const [until, setUntil] = useState(() => addDays(today, 3));
  const [message, setMessage] = useState("");
  const mutation = useMutation();
  const visible = detail.recipients.filter((recipient) => childNameMatches(recipient.fullName, query) &&
    (filter === "all" || (filter === "unfinished" ? recipient.completionStatus !== "COMPLETED" : recipient.completionStatus === "COMPLETED")));
  const visibleUnfinished = visible.filter((recipient) => recipient.completionStatus !== "COMPLETED" && recipient.inClass);
  const selected = detail.recipients.filter((recipient) => recipient.inClass && picked.has(recipient.childId));
  const selectedIds = new Set(selected.map((recipient) => recipient.childId));
  const hiddenSelected = selected.length - visible.filter((recipient) => selectedIds.has(recipient.childId)).length;

  function toggle(childId: string) {
    setPicked((previous) => {
      const next = new Set(previous);
      if (next.has(childId)) next.delete(childId);
      else next.add(childId);
      return next;
    });
  }

  return (
    <Panel title="Tiến độ từng trẻ">
      <div className="mb-3 flex flex-wrap items-end gap-3 border-b border-line pb-3">
        <div className="min-w-0 grow basis-44">
          <label htmlFor="recipient-search" className="asset-label">Tìm tên trẻ</label>
          <input id="recipient-search" type="search" className="asset-input mt-1" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <div className="min-w-0 grow sm:grow-0">
          <label htmlFor="recipient-filter" className="asset-label">Tiến độ</label>
          <select id="recipient-filter" className="asset-input mt-1" value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="all">Tất cả</option>
            <option value="unfinished">Chưa hoàn thành</option>
            <option value="completed">Đã hoàn thành</option>
          </select>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status" className="text-sm text-ink-soft">{visible.length}/{detail.recipients.length} trẻ hiển thị</p>
        {editable && visibleUnfinished.length > 0 && (
          <button type="button" className="asset-button-secondary" onClick={() => setPicked(new Set(visibleUnfinished.map((recipient) => recipient.childId)))}>
            Chọn trẻ chưa xong đang hiển thị ({visibleUnfinished.length})
          </button>
        )}
      </div>
      {message && <p role="status" className="mt-3 rounded-xl bg-leaf-soft p-3 text-sm text-ink">{message}</p>}
      {!visible.length && <p className="py-4 text-sm text-ink-soft">{detail.recipients.length ? "Không tìm thấy trẻ theo bộ lọc này." : "Bài giao chưa có người nhận."}</p>}
      <ul className="divide-y divide-line">
        {visible.map((recipient) => {
          const done = new Set(recipient.completedVersionIds);
          const missing = detail.games.filter((game) => !done.has(game.versionId));
          return (
            <li key={recipient.childId} className="flex items-start gap-3 py-4">
              {editable && recipient.inClass && (
                <label className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg hover:bg-cream">
                  <input type="checkbox" className="size-5 accent-leaf" checked={selectedIds.has(recipient.childId)} onChange={() => toggle(recipient.childId)} aria-label={`Chọn ${recipient.fullName} để gia hạn`} />
                </label>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link className="break-words font-semibold hover:text-leaf hover:underline" href={`/${api.scope}/classrooms/${classId}/children/${recipient.childId}`}>
                    {recipient.fullName}
                  </Link>
                  <StatusPill tone={completionTones[recipient.completionStatus]}>{completionLabels[recipient.completionStatus]}</StatusPill>
                </div>
                <p className="mt-1 text-sm text-ink-soft">
                  <span className="font-semibold text-ink">{detail.games.length - missing.length}/{detail.games.length} trò đã xong</span>
                  {!recipient.inClass ? " · Đã chuyển lớp" : recipient.extendedUntil ? ` · Được chơi đến ${formatDateTime(recipient.extendedUntil)}` : ""}
                </p>
                {missing.length > 0 && (
                  <details className="mt-2 text-sm text-ink-soft">
                    <summary className="min-h-11 cursor-pointer rounded-lg py-3 font-medium text-ink [overflow-wrap:anywhere]">
                      Còn {missing.length} trò: {missing.slice(0, 2).map((game) => game.name).join(", ")}{missing.length > 2 ? "…" : ""}
                    </summary>
                    <ul className="list-disc space-y-1 pl-5">
                      {missing.map((game) => <li key={game.versionId} className="break-words">{game.name}{!game.available ? " (đã lưu trữ)" : ""}</li>)}
                    </ul>
                  </details>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {editable && selected.length > 0 && (
        <form className="mt-4 space-y-3 rounded-2xl border border-line bg-cream p-3" onSubmit={(event) => {
          event.preventDefault();
          if (!until || until < today) return;
          setMessage("");
          void mutation.run(async () => {
            onChange(await api.extend(detail.assignmentId, { childIds: selected.map((recipient) => recipient.childId), until: new Date(`${until}T23:59:59.999+07:00`).toISOString() }));
            setMessage(`Đã gia hạn cho ${selected.length} trẻ đến hết ngày ${formatDateOnly(until)}.`);
            setPicked(new Set());
          });
        }}>
          <p className="text-sm font-semibold">Đã chọn {selected.length} trẻ{hiddenSelected > 0 ? `, gồm ${hiddenSelected} trẻ ngoài bộ lọc hiện tại` : ""}</p>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="recipient-until" className="asset-label">Gia hạn đến hết ngày</label>
              <input id="recipient-until" type="date" className="asset-input mt-1" min={today} value={until} onChange={(event) => setUntil(event.target.value)} required />
            </div>
            <button type="submit" className="asset-button-primary" disabled={mutation.busy || !until || until < today}>
              {mutation.busy ? "Đang gia hạn…" : "Gia hạn cho trẻ đã chọn"}
            </button>
            <button type="button" className="asset-button-secondary" onClick={() => setPicked(new Set())}>Bỏ chọn</button>
          </div>
        </form>
      )}
      {mutation.error && <p role="alert" className="asset-error mt-3">{mutation.error}</p>}
    </Panel>
  );
}

function Settings({ api, detail, onChange }: { api: AssignmentApi; detail: AssignmentDetail; onChange: (value: AssignmentDetail) => void }) {
  const [dueOn, setDueOn] = useState(detail.dueAt ? toLocalDateInput(detail.dueAt) : "");
  const mutation = useMutation();
  return (
    <Panel title="Điều chỉnh">
      <label className="asset-label" htmlFor="due-edit">Hạn chung (hết ngày)</label>
      <div className="mt-1 flex gap-2">
        <input id="due-edit" type="date" className="asset-input min-w-0 flex-1" min={localToday()} value={dueOn} onChange={(event) => setDueOn(event.target.value)} />
        <button type="button" className="asset-button-secondary" disabled={mutation.busy || !dueOn} onClick={() => void mutation.run(async () => onChange(await api.update(detail.assignmentId, { dueAt: endOfLocalDay(dueOn) })))}>
          Lưu
        </button>
      </div>
      {detail.dueAt && (
        <button type="button" className="asset-text-button mt-2" disabled={mutation.busy} onClick={() => void mutation.run(async () => {
          onChange(await api.update(detail.assignmentId, { dueAt: null }));
          setDueOn("");
        })}>
          Bỏ hạn
        </button>
      )}
      <div className="mt-5 border-t border-line pt-4">
        <button
          type="button"
          className="asset-button-danger w-full"
          disabled={mutation.busy}
          onClick={() => {
            if (window.confirm(`Hủy bài "${detail.title}"? Trẻ sẽ không thấy bài này nữa; lượt chơi đã có vẫn được giữ.`))
              void mutation.run(async () => onChange(await api.update(detail.assignmentId, { status: "CANCELLED" })));
          }}
        >
          Hủy bài
        </button>
      </div>
      {mutation.error && <p role="alert" className="asset-error mt-3">{mutation.error}</p>}
    </Panel>
  );
}
