"use client";

import { useState, type FormEvent } from "react";
import { tokenUsageReportSchema } from "@lumikids/shared";
import type { TokenUsageReport } from "@lumikids/shared";
import { useAuth } from "@/components/auth-provider";
import {
  ClassroomShell,
  ErrorBanner,
  Notice,
  Panel,
} from "@/features/classrooms/classroom-shell";
import { useClassroomSession } from "@/features/classrooms/use-classroom-session";
import { useResource } from "@/features/classrooms/use-resource";
import type { ClassroomApi } from "@/features/classrooms/api";

const number = (value: number | null) =>
  value === null ? "Chưa nhận" : value.toLocaleString("vi-VN");
const day = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

export function TokenUsagePage({ admin = false }: { admin?: boolean }) {
  const { session, loading, api } = useClassroomSession(
    admin ? "MANAGE_USERS" : "READ_OWN_CLASSROOMS",
  );
  if (loading || !session || !api)
    return <Notice>Đang kiểm tra phiên đăng nhập…</Notice>;
  if (
    admin &&
    (!session.user.roles.includes("ROLE_ADMIN") ||
      !session.user.permissions.includes("MANAGE_USERS"))
  )
    return <Notice>Bạn chưa có quyền xem mức sử dụng của giáo viên.</Notice>;
  return <Usage key={session.user.userId} api={api} admin={admin} />;
}

function Usage({ api, admin }: { api: ClassroomApi; admin: boolean }) {
  const { session } = useAuth();
  const [filters, setFilters] = useState(() => ({
    from: day(new Date(Date.now() - 29 * 86400000)),
    to: day(new Date()),
    search: "",
  }));
  const [applied, setApplied] = useState(filters);
  const [userId, setUserId] = useState("");
  const [page, setPage] = useState(1);
  const query = new URLSearchParams({
    ...applied,
    page: String(page),
    ...(userId ? { userId } : {}),
  });
  const result = useResource(
    (signal) =>
      api
        .raw(`/token-usage/${admin ? "teachers" : "me"}?${query}`, { signal })
        .then((data) => tokenUsageReportSchema.parse(data)),
    query.toString(),
  );
  const data = result.loading || result.error ? null : result.data;
  function apply(event: FormEvent) {
    event.preventDefault();
    setApplied(filters);
    setUserId("");
    setPage(1);
  }
  return (
    <ClassroomShell
      title="Mức sử dụng token"
      actions={
        <button
          className="asset-button-secondary"
          onClick={result.reload}
          disabled={result.loading}
        >
          Làm mới
        </button>
      }
    >
      <form
        onSubmit={apply}
        className="mb-5 flex flex-wrap items-end gap-3 rounded-lg border border-line bg-paper p-4"
      >
        <label className="asset-label">
          Từ ngày
          <input
            type="date"
            required
            className="asset-input mt-1"
            value={filters.from}
            max={filters.to}
            onChange={(e) => setFilters({ ...filters, from: e.target.value })}
          />
        </label>
        <label className="asset-label">
          Đến ngày
          <input
            type="date"
            required
            className="asset-input mt-1"
            value={filters.to}
            min={filters.from}
            onChange={(e) => setFilters({ ...filters, to: e.target.value })}
          />
        </label>
        {admin && (
          <label className="asset-label min-w-0 flex-1 basis-48">
            Tìm tài khoản
            <input
              type="search"
              maxLength={100}
              className="asset-input mt-1"
              placeholder="Tên hoặc email giáo viên"
              value={filters.search}
              onChange={(e) =>
                setFilters({ ...filters, search: e.target.value })
              }
            />
          </label>
        )}
        <button className="asset-button-primary" type="submit">
          Áp dụng
        </button>
      </form>
      {result.error && (
        <ErrorBanner message={result.error} onRetry={result.reload} />
      )}
      {result.loading && (
        <p role="status" className="py-6 text-sm text-ink-soft">
          Đang tải mức sử dụng…
        </p>
      )}
      {data && (
        <div className="space-y-5">
          {userId && (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span>
                Đang xem: {data.accounts[0]?.fullName ?? "Tài khoản đã chọn"}
              </span>
              <button
                className="asset-text-button"
                onClick={() => {
                  setUserId("");
                  setPage(1);
                }}
              >
                Xem tất cả tài khoản
              </button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {(
              [
                ["Tổng token đã ghi nhận", data.totals.totalTokens],
                ["Token đầu vào", data.totals.inputTokens],
                ["Token đầu ra", data.totals.outputTokens],
                ["Lần gọi AI", data.totals.calls],
              ] as const
            ).map(([label, value]) => (
              <div
                key={label}
                className="rounded-lg border border-line bg-paper p-4"
              >
                <p className="text-xs text-ink-soft">{label}</p>
                  <p className="mt-2 break-all text-2xl font-semibold tabular-nums">
                  {number(value)}
                </p>
              </div>
            ))}
          </div>
          <LatencyPanel latency={data.latency} />
          {data.totals.unknownCalls > 0 && (
            <p
              role="status"
              className="rounded-md border border-line bg-paper p-3 text-sm"
            >
              Có {number(data.totals.unknownCalls)} lần gọi chưa nhận được số
              token (ví dụ mất kết nối hoặc hết thời gian). Tổng phía trên chỉ
              gồm số liệu đã nhận, không phải toàn bộ chi phí thực tế.
            </p>
          )}
          {admin && (
            <Panel
              title="Sử dụng theo tài khoản"
            >
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[580px] text-left">
                  <thead>
                    <tr>
                      <th className="p-2">Tài khoản</th>
                      <th className="p-2 text-right">Lần gọi</th>
                      <th className="p-2 text-right">Tổng token</th>
                      <th className="p-2 text-right">Chưa nhận số liệu</th>
                      <th>
                        <span className="sr-only">Chi tiết</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.accounts.map((a) => (
                      <tr key={a.userId}>
                        <td className="p-2">
                          <p className="font-medium">
                            {a.fullName}
                            {a.userId === session?.user.userId ? " (tôi)" : ""}
                          </p>
                          <p className="text-xs text-ink-soft">{a.email}</p>
                        </td>
                        <td className="p-2 text-right">
                          {number(a.totals.calls)}
                        </td>
                        <td className="p-2 text-right">
                          {number(a.totals.totalTokens)}
                        </td>
                        <td className="p-2 text-right">
                          {number(a.totals.unknownCalls)}
                        </td>
                        <td className="p-2 text-right">
                          <button
                            className="asset-text-button"
                            aria-label={`Xem token của ${a.fullName}`}
                            onClick={() => {
                              setUserId(a.userId);
                              setPage(1);
                            }}
                          >
                            Xem
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!data.accounts.length && (
                <p className="py-4 text-sm text-ink-soft">
                  Không có tài khoản phù hợp.
                </p>
              )}
            </Panel>
          )}
          <Panel
            title="Lịch sử gọi AI"
          >
            {!data.items.length ? (
              <p className="py-4 text-sm text-ink-soft">
                Chưa có lịch sử trong khoảng thời gian đã chọn.
              </p>
            ) : (
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[760px] text-left">
                  <thead>
                    <tr>
                      <th className="p-2">Thời gian</th>
                      {admin && <th className="p-2">Tài khoản</th>}
                      <th className="p-2">Loại / mô hình</th>
                      <th className="p-2 text-right">Đầu vào</th>
                      <th className="p-2 text-right">Đầu ra</th>
                      <th className="p-2 text-right">Tổng</th>
                      <th className="p-2">Phản hồi AI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.items.map((i) => (
                      <tr key={i.id}>
                        <td className="p-2">
                          <time dateTime={i.createdAt}>
                            {new Date(i.createdAt).toLocaleString("vi-VN", {
                              timeZone: "Asia/Ho_Chi_Minh",
                            })}
                          </time>
                          <p className="text-xs text-ink-soft">
                            Lần {i.attempt}
                            {i.durationMs !== null && ` · ${seconds(i.durationMs)}`}
                          </p>
                        </td>
                        {admin && <td className="p-2">{i.user.fullName}</td>}
                        <td className="p-2">
                          {(
                            {
                              COUNTING: "Đếm số",
                              MATCHING: "Ghép cặp",
                              CLASSIFICATION: "Phân loại",
                              PATTERN: "Sắp xếp theo quy tắc",
                            } as Record<string, string>
                          )[i.gameType] ?? i.gameType}
                          <p className="text-xs text-ink-soft">
                            {i.model ?? "Chưa nhận tên mô hình"}
                          </p>
                        </td>
                        <td className="p-2 text-right tabular-nums">
                          {number(i.inputTokens)}
                        </td>
                        <td className="p-2 text-right tabular-nums">
                          {number(i.outputTokens)}
                        </td>
                        <td
                          className="p-2 text-right tabular-nums"
                          title={`Suy luận: ${number(i.thoughtTokens)}; cache: ${number(i.cachedTokens)}`}
                        >
                          {number(i.totalTokens)}
                        </td>
                        <td className="p-2 text-xs" title={i.status}>
                          {i.status === "OK"
                            ? "Nhận nội dung"
                            : "Không thành công"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {data.pagination.totalPages > 1 && (
              <nav
                aria-label="Phân trang lịch sử token"
                className="mt-4 flex items-center justify-between gap-3"
              >
                <button
                  className="asset-button-secondary"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  Trước
                </button>
                <span className="text-sm">
                  {page} / {data.pagination.totalPages}
                </span>
                <button
                  className="asset-button-secondary"
                  disabled={page >= data.pagination.totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  Sau
                </button>
              </nav>
            )}
          </Panel>
        </div>
      )}
    </ClassroomShell>
  );
}

function seconds(ms: number) {
  return `${(ms / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} giây`;
}

/** NFR-2: generation should answer within 30 s; p50/p95 over the calls measured in the range. */
function LatencyPanel({ latency }: { latency: TokenUsageReport["latency"] }) {
  if (!latency.measuredCalls)
    return (
      <p className="rounded-md border border-line bg-paper p-3 text-sm text-ink-soft">
        Chưa có lần gọi nào được đo thời gian phản hồi trong khoảng này.
      </p>
    );
  const over = latency.overBudgetCalls > 0;
  return (
    <section aria-label="Thời gian phản hồi AI" className="rounded-lg border border-line bg-paper p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">Thời gian phản hồi</h2>
        <p className="text-xs text-ink-soft">Mục tiêu dưới 30 giây · {number(latency.measuredCalls)} lần đã đo</p>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ["Trung vị (p50)", latency.p50Ms === null ? "—" : seconds(latency.p50Ms)],
            ["p95", latency.p95Ms === null ? "—" : seconds(latency.p95Ms)],
            ["Chậm nhất", latency.maxMs === null ? "—" : seconds(latency.maxMs)],
            ["Quá 30 giây / hết giờ", `${number(latency.overBudgetCalls)} / ${number(latency.timeoutCalls)}`],
          ] as const
        ).map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-ink-soft">{label}</dt>
            <dd className={`mt-1 text-lg font-semibold tabular-nums ${label.startsWith("Quá") && over ? "text-berry" : ""}`}>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
