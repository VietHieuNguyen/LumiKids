"use client";
import Link from "next/link";
import { useId, useState } from "react";
import type { AssignmentApi } from "./api";
import { ErrorBanner, Panel, StatusPill } from "./classroom-shell";
import { assignmentStateLabels, assignmentStateTones, formatDateTime } from "./format";
import { useResource } from "./use-resource";

export function AssignmentsPanel({ api, classId, canAssign }: { api: AssignmentApi; classId: string; canAssign: boolean }) {
  const filterId = useId();
  const [filter, setFilter] = useState("all");
  const list = useResource((signal) => api.list(signal), classId);
  const items = (list.data ?? []).filter((item) => filter === "all" || (filter === "replay" ? item.pendingReplayCount > 0 : item.state === filter));
  return (
    <Panel title="Bài đã giao">
      {!!list.data?.length && <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-0 grow sm:max-w-xs">
          <label className="asset-label" htmlFor={filterId}>Lọc bài giao</label>
          <select id={filterId} className="asset-input mt-1" value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="all">Tất cả</option>
            <option value="OPEN">Đang mở</option>
            <option value="UPCOMING">Chưa mở</option>
            <option value="CLOSED">Đã hết hạn</option>
            <option value="CANCELLED">Đã hủy</option>
            <option value="replay">Có yêu cầu chơi lại</option>
          </select>
        </div>
        <p role="status" className="pb-2 text-sm text-ink-soft">{items.length} bài hiển thị</p>
      </div>}
      {list.error && <ErrorBanner message={list.error} onRetry={list.reload} />}
      {list.loading && !list.data && <p role="status" className="text-sm text-ink-soft">Đang tải bài giao…</p>}
      {list.data?.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line bg-white p-8 text-center">
          <p className="font-display text-xl font-bold">Chưa có bài nào</p>
          <p className="mt-1 text-sm text-ink-soft">
            {api.scope === "admin" ? "Giáo viên của lớp chưa giao bài nào. Trẻ đăng nhập sẽ chưa có trò để chơi." : "Trẻ chỉ thấy trò được giao. Giao bài đầu tiên để các bé bắt đầu chơi."}
          </p>
          {canAssign && <Link className="lumi-button-sun mt-4" href={`/teacher/classrooms/${classId}/assignments/new`}>Giao bài mới</Link>}
        </div>
      )}
      {!!list.data?.length && !items.length && <p className="py-4 text-sm text-ink-soft">Không có bài ở trạng thái này.</p>}
      <ul className="grid gap-3">
        {items.map((item) => {
          const percent = item.recipientCount ? Math.round((item.completedCount / item.recipientCount) * 100) : 0;
          return (
            <li key={item.assignmentId}>
              <Link
                href={`/${api.scope}/classrooms/${classId}/assignments/${item.assignmentId}`}
                className={`block rounded-2xl border border-line bg-white p-4 transition hover:border-leaf/50 hover:shadow-sm ${item.state === "CANCELLED" ? "opacity-60" : ""}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-words font-display text-lg font-bold">{item.title}</p>
                    <p className="text-xs text-ink-soft">
                      {item.targetLabel} · {item.gameCount} trò · Giao bởi {item.createdByName} · Mở {formatDateTime(item.opensAt)}
                      {item.dueAt ? ` · Hạn ${formatDateTime(item.dueAt)}` : " · Không hạn"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {item.pendingReplayCount > 0 && <StatusPill tone="amber">{item.pendingReplayCount} xin chơi lại</StatusPill>}
                    <StatusPill tone={assignmentStateTones[item.state]}>{assignmentStateLabels[item.state]}</StatusPill>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink/8" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Tỉ lệ hoàn thành">
                    <div className="h-full rounded-full bg-leaf transition-[width]" style={{ width: `${percent}%` }} />
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {item.completedCount}/{item.recipientCount} xong
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
