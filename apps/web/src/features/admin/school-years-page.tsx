"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { SchoolYearUsage } from "@lumikids/shared";
import { classroomError } from "../classrooms/api";
import type { ClassroomApi } from "../classrooms/api";
import { ClassroomShell, Dialog, ErrorBanner, Notice, Panel, StatusPill } from "../classrooms/classroom-shell";
import { formatDateOnly } from "../classrooms/format";
import { useClassroomSession } from "../classrooms/use-classroom-session";
import { useResource } from "../classrooms/use-resource";
import { AdminApi } from "./api";
import { KpiRow } from "./account-ui";

/** Today in Vietnam as "YYYY-MM-DD", the same calendar the school years use. */
const vietnamToday = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

function phase(year: { startDate: string; endDate: string }, today: string) {
  if (today < year.startDate) return { label: "Sắp tới", tone: "blue" as const };
  if (today > year.endDate) return { label: "Đã kết thúc", tone: "slate" as const };
  return { label: "Đang diễn ra", tone: "green" as const };
}

export function SchoolYearsPage() {
  const { session, loading, api, allowed } = useClassroomSession("MANAGE_CLASSROOMS");
  if (loading || !session || !api) return <Notice>Đang kiểm tra phiên đăng nhập…</Notice>;
  if (!allowed) return <Notice>Bạn chưa có quyền quản lý năm học.</Notice>;
  return <SchoolYears key={session.user.userId} api={api} />;
}

function SchoolYears({ api }: { api: ClassroomApi }) {
  const admin = useMemo(() => new AdminApi(api), [api]);
  const years = useResource((signal) => admin.schoolYears(signal), "school-years");
  const [dialog, setDialog] = useState<{ year: SchoolYearUsage | null } | null>(null);
  const [today] = useState(vietnamToday);
  const all = years.data ?? [];
  const current = all.find((year) => phase(year, today).label === "Đang diễn ra");

  return (
    <ClassroomShell
      title="Năm học"
      eyebrow="Quản trị"
      actions={
        <button type="button" className="lumi-button-sun" onClick={() => setDialog({ year: null })}>
          <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true"><path d="M9 3v12M3 9h12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
          Thêm năm học
        </button>
      }
    >
      {years.error && <ErrorBanner message={years.error} onRetry={years.reload} />}
      {years.data && (
        <KpiRow
          items={[
            { label: "Năm học", value: all.length },
            { label: "Năm đang diễn ra", value: current?.name ?? "Chưa có", hint: current ? `${formatDateOnly(current.startDate)} – ${formatDateOnly(current.endDate)}` : "Hãy tạo năm học cho hôm nay." },
            { label: "Lớp đang hoạt động", value: current?.activeClassroomCount ?? 0, hint: current ? `trong năm ${current.name}` : undefined },
            { label: "Trẻ đang học", value: current?.childCount ?? 0, hint: current ? `trong năm ${current.name}` : undefined },
          ]}
        />
      )}
      <Panel title="Danh sách năm học" description="Mỗi lớp thuộc một năm học. Đổi tên hoặc thời gian không ảnh hưởng lớp, trẻ và lịch sử chơi đã có.">
        {years.loading && !years.data && <p role="status" className="py-6 text-sm text-ink-soft">Đang tải năm học…</p>}
        {years.data && all.length === 0 && (
          <div className="rounded-lg border border-dashed border-line px-4 py-10 text-center">
            <p className="text-sm font-semibold">Chưa có năm học nào</p>
            <p className="mt-1 text-sm text-ink-soft">Tạo năm học trước, rồi thêm lớp ở trang Quản lý lớp.</p>
          </div>
        )}
        {all.length > 0 && (
          <div className="-mx-4 overflow-x-auto sm:mx-0">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-line text-ink-soft">
                <tr>
                  <th className="px-4 py-2 font-medium sm:px-3">Năm học</th>
                  <th className="px-3 py-2 font-medium">Thời gian</th>
                  <th className="px-3 py-2 text-right font-medium">Lớp</th>
                  <th className="px-3 py-2 text-right font-medium">Trẻ đang học</th>
                  <th className="px-3 py-2 font-medium">Trạng thái</th>
                  <th className="px-3 py-2"><span className="sr-only">Thao tác</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {all.map((year) => {
                  const state = phase(year, today);
                  return (
                    <tr key={year.schoolYearId}>
                      <td className="whitespace-nowrap px-4 py-3 font-semibold sm:px-3">{year.name}</td>
                      <td className="whitespace-nowrap px-3 py-3 tabular-nums">{formatDateOnly(year.startDate)} – {formatDateOnly(year.endDate)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                        {year.classroomCount > 0 ? (
                          <Link className="text-leaf hover:underline" href={`/admin/classrooms?year=${year.schoolYearId}`}>
                            {year.activeClassroomCount}
                            {year.classroomCount > year.activeClassroomCount && <span className="text-ink-soft"> / {year.classroomCount}</span>}
                          </Link>
                        ) : (
                          <span className="text-ink-soft">0</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{year.childCount}</td>
                      <td className="whitespace-nowrap px-3 py-3"><StatusPill tone={state.tone}>{state.label}</StatusPill></td>
                      <td className="px-3 py-3 text-right">
                        <button type="button" className="asset-button-secondary" onClick={() => setDialog({ year })} aria-label={`Sửa năm học ${year.name}`}>Sửa</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-3 px-4 text-xs text-ink-soft sm:px-0">Cột Lớp: số lớp đang hoạt động / tổng số lớp (gồm lớp đã lưu trữ).</p>
          </div>
        )}
      </Panel>
      {dialog && (
        <SchoolYearDialog
          api={api}
          year={dialog.year}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            years.reload();
          }}
        />
      )}
    </ClassroomShell>
  );
}

/** Create a school year, or edit one (only the fields that changed are sent). */
function SchoolYearDialog({ api, year, onClose, onSaved }: { api: ClassroomApi; year: SchoolYearUsage | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(year?.name ?? "");
  const [startDate, setStartDate] = useState(year?.startDate ?? "");
  const [endDate, setEndDate] = useState(year?.endDate ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const unchanged = year !== null && name.trim() === year.name && startDate === year.startDate && endDate === year.endDate;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || unchanged) return;
    if (endDate <= startDate) {
      setError("Ngày kết thúc phải sau ngày bắt đầu.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (year)
        await api.updateSchoolYear(year.schoolYearId, {
          ...(name.trim() !== year.name ? { name: name.trim() } : {}),
          ...(startDate !== year.startDate ? { startDate } : {}),
          ...(endDate !== year.endDate ? { endDate } : {}),
        });
      else await api.createSchoolYear({ name: name.trim(), startDate, endDate });
      onSaved();
    } catch (failure) {
      setError(classroomError(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title={year ? `Sửa năm học ${year.name}` : "Thêm năm học"} onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <div>
          <label className="asset-label" htmlFor="year-name">Tên năm học</label>
          <input id="year-name" className="asset-input mt-1" required maxLength={50} value={name} onChange={(event) => setName(event.target.value)} placeholder="2026–2027" disabled={busy} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="asset-label" htmlFor="year-start">Bắt đầu</label>
            <input id="year-start" type="date" className="asset-input mt-1" required value={startDate} onChange={(event) => setStartDate(event.target.value)} disabled={busy} />
          </div>
          <div>
            <label className="asset-label" htmlFor="year-end">Kết thúc</label>
            <input id="year-end" type="date" className="asset-input mt-1" required min={startDate || undefined} value={endDate} onChange={(event) => setEndDate(event.target.value)} disabled={busy} />
          </div>
        </div>
        {error && <p role="alert" className="asset-error">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="asset-button-secondary" onClick={onClose} disabled={busy}>Hủy</button>
          <button className="asset-button-primary" disabled={busy || unchanged || !name.trim() || !startDate || !endDate}>
            {busy ? "Đang lưu…" : year ? "Lưu thay đổi" : "Tạo năm học"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
