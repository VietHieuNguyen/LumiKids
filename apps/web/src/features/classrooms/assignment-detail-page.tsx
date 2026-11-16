"use client";
import { useMemo, useState } from "react";
import type { AssignmentDetail, AssignmentRecipient } from "@lumikids/shared";
import { GameSymbol } from "../game-runtime/components/game-symbol";
import { gameTypeLabels } from "../game-library/library-page";
import { AssignmentApi, classroomError } from "./api";
import type { ClassroomApi } from "./api";
import { ClassroomShell, ErrorBanner, Notice, Panel, StatusPill } from "./classroom-shell";
import {
  addDays,
  assignmentStateLabels,
  assignmentStateTones,
  completionLabels,
  endOfLocalDay,
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
  return <Detail key={`${session.user.userId}:${assignmentId}`} api={api} classId={classId} assignmentId={assignmentId} canAssign={canAssign} />;
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

function Detail({ api, classId, assignmentId, canAssign }: { api: ClassroomApi; classId: string; assignmentId: string; canAssign: boolean }) {
  const assignments = useMemo(() => new AssignmentApi(api, classId), [api, classId]);
  const detail = useResource((signal) => assignments.detail(assignmentId, signal), assignmentId);
  const back = { href: `/teacher/classrooms/${classId}`, label: "Bài đã giao" };
  if (!detail.data)
    return (
      <ClassroomShell title="Bài giao" back={back}>
        {detail.error ? <ErrorBanner message={detail.error} onRetry={detail.reload} /> : <p role="status" className="text-ink-soft">Đang tải bài…</p>}
      </ClassroomShell>
    );
  const data = detail.data;
  const editable = canAssign && data.state !== "CANCELLED";
  return (
    <ClassroomShell
      title={data.title}
      eyebrow={`${data.targetLabel} · giao bởi ${data.createdByName}`}
      back={back}
      actions={<StatusPill tone={assignmentStateTones[data.state]}>{assignmentStateLabels[data.state]}</StatusPill>}
    >
      {detail.error && <ErrorBanner message={detail.error} onRetry={detail.reload} />}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <ReplayRequests api={assignments} detail={data} editable={editable} onChange={detail.replace} />
          <Recipients api={assignments} detail={data} editable={editable} onChange={detail.replace} />
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
                  Chưa cho
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

function Recipients({ api, detail, editable, onChange }: { api: AssignmentApi; detail: AssignmentDetail; editable: boolean; onChange: (value: AssignmentDetail) => void }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [until, setUntil] = useState(() => addDays(localToday(), 3));
  const mutation = useMutation();
  const unfinished = detail.recipients.filter((recipient) => recipient.completionStatus !== "COMPLETED" && recipient.inClass);
  function toggle(recipient: AssignmentRecipient) {
    const next = new Set(picked);
    if (next.has(recipient.childId)) next.delete(recipient.childId);
    else next.add(recipient.childId);
    setPicked(next);
  }
  return (
    <Panel
      title="Tiến độ từng trẻ"
      description="Mỗi ô là một trò; ô xanh là trẻ đã chơi xong trò đó."
      actions={editable && unfinished.length > 0 ? (
        <button type="button" className="asset-text-button" onClick={() => setPicked(new Set(unfinished.map((recipient) => recipient.childId)))}>
          Chọn trẻ chưa xong ({unfinished.length})
        </button>
      ) : undefined}
    >
      <ul className="divide-y divide-line">
        {detail.recipients.map((recipient) => {
          const done = new Set(recipient.completedVersionIds);
          return (
            <li key={recipient.childId} className="flex flex-wrap items-center gap-3 py-3">
              {editable && (
                <input type="checkbox" className="h-5 w-5 accent-[#2f8a4d]" checked={picked.has(recipient.childId)} onChange={() => toggle(recipient)} aria-label={`Chọn ${recipient.fullName}`} disabled={!recipient.inClass} />
              )}
              <span className="min-w-0 flex-1">
                <span className="block break-words font-semibold">{recipient.fullName}</span>
                <span className="block text-xs text-ink-soft">
                  {!recipient.inClass ? "Đã chuyển lớp" : recipient.extendedUntil ? `Được chơi đến ${formatDateTime(recipient.extendedUntil)}` : " "}
                </span>
              </span>
              <span className="flex gap-1" aria-label={`${done.size}/${detail.games.length} trò xong`}>
                {detail.games.map((game) => (
                  <span key={game.versionId} title={game.name} className={`h-6 w-6 rounded-lg ${done.has(game.versionId) ? "bg-leaf" : "bg-ink/10"}`} />
                ))}
              </span>
              <StatusPill tone={completionTones[recipient.completionStatus]}>{completionLabels[recipient.completionStatus]}</StatusPill>
            </li>
          );
        })}
      </ul>
      {editable && picked.size > 0 && (
        <div className="sticky bottom-4 mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-ink p-3 text-white shadow-xl">
          <span className="text-sm font-semibold">Mở lại cho {picked.size} trẻ đến hết ngày</span>
          <input type="date" className="asset-input w-auto text-ink" min={localToday()} value={until} onChange={(event) => setUntil(event.target.value)} aria-label="Hạn mới" />
          <button
            type="button"
            className="lumi-button-sun"
            disabled={mutation.busy || !until}
            onClick={() =>
              void mutation.run(async () => {
                onChange(await api.extend(detail.assignmentId, { childIds: [...picked], until: endOfLocalDay(until) }));
                setPicked(new Set());
              })
            }
          >
            Giao lại
          </button>
          <button type="button" className="text-sm font-semibold text-white/80 underline" onClick={() => setPicked(new Set())}>Bỏ chọn</button>
        </div>
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
