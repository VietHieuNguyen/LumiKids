"use client";
import Link from "next/link";
import { useMemo } from "react";
import type { AdminOverview } from "@lumikids/shared";
import { ClassroomShell, ErrorBanner, Notice, Panel, StatusPill } from "../classrooms/classroom-shell";
import { formatDateTime } from "../classrooms/format";
import { useClassroomSession } from "../classrooms/use-classroom-session";
import { useResource } from "../classrooms/use-resource";
import { useRowLink } from "../classrooms/use-row-link";
import type { ClassroomApi } from "../classrooms/api";
import { AdminApi } from "./api";
import { attentionItems } from "./attention";
import type { AttentionItem } from "./attention";
import { percent, shortDay, trendLabel } from "./format";

export function AdminDashboardPage() {
  const { session, loading, api, allowed } = useClassroomSession("MANAGE_CLASSROOMS");
  if (loading || !session || !api) return <Notice>Đang kiểm tra phiên đăng nhập…</Notice>;
  if (!allowed)
    return (
      <Notice>
        Tài khoản này không có quyền quản trị.{" "}
        <Link className="font-semibold text-leaf underline" href="/account">
          Về trang của bạn
        </Link>
      </Notice>
    );
  return <Dashboard key={session.user.userId} api={api} />;
}

function Dashboard({ api }: { api: ClassroomApi }) {
  const admin = useMemo(() => new AdminApi(api), [api]);
  const overview = useResource((signal) => admin.overview(signal), "overview");
  const data = overview.data;
  const year = data?.schoolYear;
  return (
    <ClassroomShell
      title="Tổng quan trường"
      eyebrow={year ? `Năm học ${year.name}${year.daysLeft >= 0 ? ` · còn ${year.daysLeft} ngày` : " · đã kết thúc"}` : "Quản trị"}
      actions={
        <button type="button" className="asset-button-secondary" onClick={overview.reload} disabled={overview.loading}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className={overview.loading ? "motion-safe:animate-spin" : ""}>
            <path d="M13.5 8A5.5 5.5 0 1 1 11.9 4.1M13.5 2.5v3h-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {overview.loading ? "Đang tải…" : "Làm mới"}
        </button>
      }
    >
      {overview.error && <ErrorBanner message={overview.error} onRetry={overview.reload} />}
      {!data && !overview.error && <Skeleton />}
      {data && <DashboardBody data={data} />}
    </ClassroomShell>
  );
}

export function DashboardBody({ data }: { data: AdminOverview }) {
  return (
    <div className="admin-dashboard">
      <nav aria-label="Thao tác quản trị" className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-paper p-3">
        <Link href="/admin/children" className="asset-button-primary">Quản lý trẻ</Link>
        <Link href="/admin/children#unassigned-children" className="asset-button-secondary">Xếp lớp{data.attention.unassignedChildren > 0 ? ` (${data.attention.unassignedChildren})` : ""}</Link>
        <Link href="/admin/classrooms" className="asset-button-secondary">Quản lý lớp</Link>
      </nav>
      <Attention items={attentionItems(data)} />
      <Kpis data={data} />
      <Activity data={data} />
      <Classes data={data} />
      <p className="text-xs text-ink-soft">Số liệu tính lúc {formatDateTime(data.generatedAt)}, theo giờ Việt Nam.</p>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Đang tải tổng quan">
      {[160, 120, 260].map((height) => (
        <div key={height} className="motion-safe:animate-pulse rounded-3xl bg-ink/5" style={{ height }} />
      ))}
    </div>
  );
}

// ---------- 1. What needs action ----------

const toneStyle = {
  block: { box: "border-berry/25 bg-[#fff4f1]", icon: "bg-berry text-white", label: "Cần xử lý ngay" },
  warn: { box: "border-sun-edge/40 bg-sun-soft", icon: "bg-sun text-ink", label: "Nên xử lý" },
  info: { box: "border-line bg-paper", icon: "bg-sky text-ink", label: "Để biết" },
} as const;

function ToneIcon({ tone }: { tone: AttentionItem["tone"] }) {
  return (
    <span aria-hidden="true" className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${toneStyle[tone].icon}`}>
      {tone === "block" ? (
        <svg width="20" height="20" viewBox="0 0 20 20"><path d="M10 5.5v5.5M10 14.2v.3" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
      ) : tone === "warn" ? (
        <svg width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M10 6.5V10l2.2 1.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 20 20"><path d="M10 9v5M10 6v.3" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
      )}
    </span>
  );
}

function Attention({ items }: { items: AttentionItem[] }) {
  if (!items.length)
    return (
      <section aria-labelledby="attention-heading" className="admin-ready flex items-center gap-4 rounded-3xl border border-leaf/25 bg-leaf-soft p-5">
        <span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-leaf text-white">
          <svg width="24" height="24" viewBox="0 0 24 24"><path d="M5.5 12.5l4 4 9-9" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
        <div>
          <h2 id="attention-heading" className="font-display text-xl font-bold">Mọi thứ đã sẵn sàng</h2>
          <p className="text-sm text-ink-soft">Lớp nào cũng có giáo viên, trẻ đã được xếp lớp và có bài để chơi.</p>
        </div>
      </section>
    );
  return (
    <section aria-labelledby="attention-heading">
      <h2 id="attention-heading" className="font-display text-xl font-bold">
        Cần xử lý <span className="ml-1 rounded-full bg-ink px-2 py-0.5 align-middle font-sans text-xs text-white">{items.length}</span>
      </h2>
      <ul className="mt-3 grid gap-3 lg:grid-cols-2">
        {items.map((item) => (
          <li key={item.id} className={`flex flex-wrap items-start gap-3 rounded-2xl border p-4 sm:flex-nowrap ${toneStyle[item.tone].box}`}>
            <ToneIcon tone={item.tone} />
            <div className="min-w-0 flex-1 basis-[calc(100%-52px)] sm:basis-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">{toneStyle[item.tone].label}</p>
              <p className="font-semibold leading-snug">{item.title}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">{item.detail}</p>
            </div>
            {item.href && (
              <Link href={item.href} className="asset-button-secondary ml-[52px] shrink-0 sm:ml-0 sm:self-center">
                {item.action}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------- 2. Headline numbers ----------

function Kpis({ data }: { data: AdminOverview }) {
  const trend = trendLabel(data.week.sessions, data.week.previousSessions);
  const participation = percent(data.week.activeChildren, data.totals.enrolledChildren);
  const completion = percent(data.week.completed, data.week.sessions);
  const tiles = [
    { label: "Lớp đang mở", value: data.totals.activeClasses, note: `${data.totals.activeTeachers} giáo viên đang hoạt động`, href: "/admin/classrooms" },
    { label: "Trẻ đang học", value: data.totals.enrolledChildren, note: `${data.attention.unassignedChildren} hồ sơ chưa xếp lớp`, href: "/admin/children" },
    {
      label: "Trẻ chơi trong 7 ngày",
      value: data.week.activeChildren,
      note: participation === null ? "Chưa có trẻ đang học" : `${participation}% số trẻ đang học`,
      href: null,
    },
    {
      label: "Lượt chơi 7 ngày",
      value: data.week.sessions,
      note: completion === null ? trend.text : `${completion}% chơi đến hết · ${trend.text}`,
      href: null,
      direction: trend.direction,
    },
  ];
  return (
    <section aria-label="Chỉ số chính" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((tile) => {
        const body = (
          <>
            <span className="text-sm font-semibold text-ink-soft">{tile.label}</span>
            <span className="admin-kpi-value mt-1 flex items-baseline gap-2 font-display text-4xl font-extrabold leading-none tabular-nums">
              {tile.value}
              {tile.direction && tile.direction !== "flat" && (
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className={tile.direction === "up" ? "text-leaf" : "rotate-180 text-berry"}>
                  <path d="M8 3l5 6H3Z" fill="currentColor" />
                </svg>
              )}
            </span>
            <span className="mt-2 text-xs leading-snug text-ink-soft">{tile.note}</span>
          </>
        );
        const style = "admin-kpi flex flex-col rounded-lg border border-line bg-paper";
        return tile.href ? (
          <Link key={tile.label} href={tile.href} className={`${style} hover:border-leaf/40`}>
            {body}
          </Link>
        ) : (
          <div key={tile.label} className={style}>
            {body}
          </div>
        );
      })}
    </section>
  );
}

// ---------- 3. Use over time ----------

function Activity({ data }: { data: AdminOverview }) {
  const max = Math.max(1, ...data.days.map((day) => day.sessions));
  const total = data.days.reduce((sum, day) => sum + day.sessions, 0);
  const last = data.days.length - 1;
  return (
    <Panel title="Lượt chơi 14 ngày gần nhất" description="Mỗi cột là số lượt trẻ mở trò trong ngày. Rê chuột hoặc chọn một cột để xem chi tiết.">
      {total === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-white p-6 text-center text-sm text-ink-soft">
          Chưa có lượt chơi nào trong 14 ngày. Khi giáo viên giao bài và trẻ đăng nhập, biểu đồ sẽ hiện ở đây.
        </p>
      ) : (
        <>
          <div className="admin-chart relative flex items-end gap-[2px] border-b border-line pt-6">
            {data.days.map((day, index) => {
              const height = day.sessions ? Math.max(4, (day.sessions / max) * 100) : 0;
              return (
                <div key={day.date} tabIndex={0} role="img" aria-label={`${shortDay(day.date)}: ${day.sessions} lượt chơi, ${day.completed} chơi hết, ${day.children} trẻ`} className="group relative flex h-full flex-1 items-end justify-center">
                  {(index === last || day.sessions === max) && day.sessions > 0 && (
                    <span className="absolute text-xs font-semibold tabular-nums text-ink" style={{ bottom: `calc(${height}% + 4px)` }}>
                      {day.sessions}
                    </span>
                  )}
                  <div
                    className={`admin-chart-bar w-full max-w-9 rounded-t-[4px] ${index === last ? "is-today" : ""}`}
                    style={{ height: `${height}%` }}
                  />
                  <div aria-hidden="true" className="pointer-events-none absolute bottom-full z-10 mb-1 hidden w-max rounded-md bg-ink px-3 py-2 text-xs text-white group-hover:block group-focus:block">
                    <p className="font-semibold">{shortDay(day.date)}</p>
                    <p>{day.sessions} lượt · {day.completed} chơi hết</p>
                    <p>{day.children} trẻ</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-xs text-ink-soft" aria-hidden="true">
            <span>{shortDay(data.days[0]?.date ?? "")}</span>
            <span>Hôm nay</span>
          </div>
          <table className="sr-only">
            <caption>Lượt chơi theo ngày</caption>
            <thead>
              <tr><th>Ngày</th><th>Lượt chơi</th><th>Chơi đến hết</th><th>Số trẻ</th></tr>
            </thead>
            <tbody>
              {data.days.map((day) => (
                <tr key={day.date}><td>{shortDay(day.date)}</td><td>{day.sessions}</td><td>{day.completed}</td><td>{day.children}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Panel>
  );
}

// ---------- 4. Class by class ----------

function Classes({ data }: { data: AdminOverview }) {
  const rowLink = useRowLink();
  return (
    <Panel title="Các lớp đang mở" description="Tỉ lệ trẻ chơi trong 7 ngày cho biết lớp nào cần giáo viên để ý.">
      {data.classes.length === 0 ? (
        <p className="text-sm text-ink-soft">
          Chưa có lớp nào. <Link className="font-semibold text-leaf underline" href="/admin/classrooms">Tạo lớp</Link>
        </p>
      ) : (
        <>
        <ul className="divide-y divide-line sm:hidden">
          {data.classes.map((row) => {
            const rate = percent(row.activeChildren7d, row.childCount);
            return (
              <li key={row.classId}>
                <Link href={`/admin/classrooms/${row.classId}`} className="block py-3">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{row.className} <span className="text-xs font-normal text-ink-soft">· {row.ageGroupName}</span></span>
                    {!row.teacherCount ? <StatusPill tone="red">Chưa có GV</StatusPill> : !row.openAssignments && row.childCount ? <StatusPill tone="amber">Không có bài</StatusPill> : null}
                  </span>
                  <span className="mt-2 flex items-center gap-2 text-sm">
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-ink/10">
                      <span className={`block h-full rounded-full ${rate !== null && rate < 50 ? "bg-sun-edge" : "bg-leaf"}`} style={{ width: `${rate ?? 0}%` }} />
                    </span>
                    <span className="tabular-nums text-ink-soft">{row.activeChildren7d}/{row.childCount} trẻ chơi</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="hidden sm:block">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-ink-soft">
              <tr>
                <th className="py-2 pr-3 font-semibold">Lớp</th>
                <th className="py-2 pr-3 font-semibold">Giáo viên</th>
                <th className="py-2 pr-3 text-right font-semibold">Trẻ</th>
                <th className="py-2 pr-3 font-semibold">Trẻ chơi 7 ngày</th>
                <th className="py-2 text-right font-semibold">Bài đang mở</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.classes.map((row) => {
                const rate = percent(row.activeChildren7d, row.childCount);
                return (
                  <tr key={row.classId} {...rowLink(`/admin/classrooms/${row.classId}`)} className="cursor-pointer hover:bg-cream/60">
                    <td className="py-3 pr-3">
                      <Link href={`/admin/classrooms/${row.classId}`} className="font-semibold text-ink hover:text-leaf">
                        {row.className}
                      </Link>
                      <span className="block text-xs text-ink-soft">{row.ageGroupName}</span>
                    </td>
                    <td className="py-3 pr-3">{row.teacherCount ? row.teacherCount : <StatusPill tone="red">Chưa có</StatusPill>}</td>
                    <td className="py-3 pr-3 text-right tabular-nums">{row.childCount}</td>
                    <td className="py-3 pr-3">
                      {rate === null ? (
                        <span className="text-ink-soft">—</span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-24 overflow-hidden rounded-full bg-ink/10">
                            <span className={`block h-full rounded-full ${rate < 50 ? "bg-sun-edge" : "bg-leaf"}`} style={{ width: `${rate}%` }} />
                          </span>
                          <span className="tabular-nums">
                            {row.activeChildren7d}/{row.childCount} <span className="text-ink-soft">({rate}%)</span>
                          </span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-right">
                      {row.openAssignments ? <span className="tabular-nums">{row.openAssignments}</span> : row.childCount ? <StatusPill tone="amber">Không có</StatusPill> : <span className="text-ink-soft">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
    </Panel>
  );
}
