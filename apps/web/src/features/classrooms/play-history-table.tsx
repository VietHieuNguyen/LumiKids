"use client";
import type { PlayHistoryPage } from "@lumikids/shared";
import { gameTypeLabels } from "../game-library/library-page";
import { StatusPill } from "./classroom-shell";
import { EvaluationCell } from "./evaluation-cell";
import { formatDateTime, formatDuration, playStatusLabels } from "./format";

const playTones = { COMPLETED: "green", ABANDONED: "slate", IN_PROGRESS: "blue" } as const;

/** A child's play sessions with their stored score, newest first, paged (teacher, admin and family views). */
export function PlayHistoryTable({ data, loading, page, onPage }: { data: PlayHistoryPage; loading: boolean; page: number; onPage: (page: number) => void }) {
  return (
    <>
    {data && data.items.length > 0 && (
      <div className="min-w-0 max-w-full overflow-x-auto rounded-md" role="region" aria-label="Bảng lượt chơi" aria-busy={loading} tabIndex={0}>
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-line text-ink-soft">
            <tr>
              <th className="px-4 py-2 font-medium sm:px-2">Trò chơi</th>
              <th className="px-2 py-2 font-medium">Bắt đầu</th>
              <th className="px-2 py-2 font-medium">Thời lượng</th>
              <th className="px-2 py-2 text-right font-medium">Số lần chọn</th>
              <th className="px-2 py-2 font-medium">Kết quả</th>
              <th className="px-2 py-2 font-medium">Điểm · mức · nhận xét</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.items.map((item) => (
              <tr key={item.sessionId}>
                <td className="px-4 py-3 sm:px-2">
                  <span className="block break-words font-medium">{item.gameName}</span>
                  <span className="text-xs text-ink-soft">{gameTypeLabels[item.gameType]}</span>
                </td>
                <td className="whitespace-nowrap px-2 py-3 tabular-nums">{formatDateTime(item.startedAt)}</td>
                <td className="whitespace-nowrap px-2 py-3">{formatDuration(item.startedAt, item.endedAt) ?? "—"}</td>
                <td className="px-2 py-3 text-right tabular-nums">{item.attemptCount}</td>
                <td className="px-2 py-3">
                  <StatusPill tone={playTones[item.status]}>{playStatusLabels[item.status]}</StatusPill>
                </td>
                <td className="px-2 py-3 align-top">
                  <EvaluationCell evaluation={item.evaluation} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
    {data && data.pagination.totalPages > 1 && (
      <div className="mt-4 flex items-center justify-between gap-3 text-sm">
        <button type="button" className="asset-button-secondary" disabled={page <= 1 || loading} onClick={() => onPage(page - 1)}>← Mới hơn</button>
        <span className="tabular-nums text-ink-soft">Trang {page}/{data.pagination.totalPages}</span>
        <button type="button" className="asset-button-secondary" disabled={page >= data.pagination.totalPages || loading} onClick={() => onPage(page + 1)}>Cũ hơn →</button>
      </div>
    )}
    </>
  );
}
