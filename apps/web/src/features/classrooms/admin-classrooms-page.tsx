"use client";
import Link from "next/link";
import { useState } from "react";
import type { FormEvent } from "react";
import type { SchoolYear } from "@lumikids/shared";
import { classroomError } from "./api";
import type { ClassroomApi } from "./api";
import { ClassroomShell, Dialog, ErrorBanner, Notice, Panel, StatusPill } from "./classroom-shell";
import { classroomStatusLabels, formatDateOnly } from "./format";
import { useClassroomSession } from "./use-classroom-session";
import { useResource } from "./use-resource";
import { useRowLink } from "./use-row-link";

export function AdminClassroomsPage() {
  const { session, loading, api, allowed } = useClassroomSession("MANAGE_CLASSROOMS");
  if (loading || !session || !api) return <Notice>Đang kiểm tra phiên đăng nhập…</Notice>;
  if (!allowed) return <Notice>Bạn chưa có quyền quản lý lớp học.</Notice>;
  return <AdminClassrooms key={session.user.userId} api={api} />;
}

function AdminClassrooms({ api }: { api: ClassroomApi }) {
  const years = useResource((signal) => api.schoolYears(signal), "years");
  const ageGroups = useResource((signal) => api.ageGroups(signal), "age-groups");
  const rowLink = useRowLink();
  const [picked, setPicked] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  // Default to the most recent school year (the API lists newest first).
  const schoolYearId = picked ?? years.data?.[0]?.schoolYearId ?? null;
  const classrooms = useResource(
    schoolYearId
      ? (signal) => api.adminClassrooms(new URLSearchParams({ schoolYearId, ...(showArchived ? {} : { status: "ACTIVE" }) }), signal)
      : null,
    `${schoolYearId}:${showArchived}`,
  );
  const year = years.data?.find((item) => item.schoolYearId === schoolYearId) ?? null;

  return (
    <ClassroomShell title="Quản lý lớp học" eyebrow="Quản trị">
      {(years.error || ageGroups.error) && <ErrorBanner message={years.error || ageGroups.error} onRetry={() => { years.reload(); ageGroups.reload(); }} />}
      <div className="admin-classroom-columns grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Panel
            title={year ? `Lớp năm học ${year.name}` : "Lớp học"}
            description={year ? `${formatDateOnly(year.startDate)} – ${formatDateOnly(year.endDate)}` : undefined}
            actions={
              years.data && years.data.length > 0 ? (
                <div className="flex flex-wrap items-center gap-3">
                  <label className="sr-only" htmlFor="school-year">Năm học</label>
                  <select id="school-year" className="asset-input w-auto" value={schoolYearId ?? ""} onChange={(event) => setPicked(event.target.value)}>
                    {years.data.map((item) => (
                      <option key={item.schoolYearId} value={item.schoolYearId}>{item.name}</option>
                    ))}
                  </select>
                  <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
                    <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
                    Hiện lớp đã lưu trữ
                  </label>
                </div>
              ) : undefined
            }
          >
            {years.data?.length === 0 && <p className="text-sm text-ink-soft">Chưa có năm học. Hãy tạo năm học trước khi thêm lớp.</p>}
            {classrooms.error && <ErrorBanner message={classrooms.error} onRetry={classrooms.reload} />}
            {schoolYearId && classrooms.loading && !classrooms.data && <p role="status" className="text-sm text-ink-soft">Đang tải lớp…</p>}
            {classrooms.data && classrooms.data.length === 0 && <p className="text-sm text-ink-soft">Năm học này chưa có lớp nào.</p>}
            {classrooms.data && classrooms.data.length > 0 && (
              <div className="-mx-4 overflow-x-auto sm:mx-0">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="border-b border-line text-ink-soft">
                    <tr>
                      <th className="px-4 py-2 font-medium sm:px-2">Lớp</th>
                      <th className="px-2 py-2 font-medium">Nhóm tuổi</th>
                      <th className="px-2 py-2 text-right font-medium">Giáo viên</th>
                      <th className="px-2 py-2 text-right font-medium">Trẻ</th>
                      <th className="px-2 py-2 font-medium">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {classrooms.data.map((item) => (
                      <tr key={item.classId} {...rowLink(`/admin/classrooms/${item.classId}`)} className="cursor-pointer hover:bg-cream">
                        <td className="px-4 py-3 sm:px-2">
                          <Link className="font-semibold text-leaf hover:underline" href={`/admin/classrooms/${item.classId}`}>{item.className}</Link>
                        </td>
                        <td className="px-2 py-3">{item.ageGroup.name}</td>
                        <td className="px-2 py-3 text-right tabular-nums">{item.teacherCount}</td>
                        <td className="px-2 py-3 text-right tabular-nums">{item.childCount}</td>
                        <td className="px-2 py-3">
                          <StatusPill tone={item.status === "ACTIVE" ? "green" : "slate"}>{classroomStatusLabels[item.status]}</StatusPill>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
        <aside className="space-y-6">
          {year && ageGroups.data && (
            <CreateClassroomForm
              api={api}
              year={year}
              ageGroups={ageGroups.data}
              onCreated={classrooms.reload}
            />
          )}
          {years.data && years.data.length > 0 && (
            <SchoolYearsPanel api={api} years={years.data} onSaved={years.reload} />
          )}
          <CreateSchoolYearForm
            api={api}
            onCreated={(created) => {
              setPicked(created.schoolYearId);
              years.reload();
            }}
          />
        </aside>
      </div>
    </ClassroomShell>
  );
}

function CreateClassroomForm({
  api,
  year,
  ageGroups,
  onCreated,
}: {
  api: ClassroomApi;
  year: SchoolYear;
  ageGroups: { ageGroupId: string; name: string }[];
  onCreated: () => void;
}) {
  const [className, setClassName] = useState("");
  const [ageGroupId, setAgeGroupId] = useState(ageGroups[0]?.ageGroupId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setDone("");
    try {
      const created = await api.createClassroom({ className: className.trim(), schoolYearId: year.schoolYearId, ageGroupId });
      setClassName("");
      setDone(`Đã tạo lớp ${created.className}.`);
      onCreated();
    } catch (failure) {
      setError(classroomError(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel title="Thêm lớp" description={`Vào năm học ${year.name}.`}>
      <form className="space-y-4" onSubmit={submit}>
        <div>
          <label className="asset-label" htmlFor="class-name">Tên lớp</label>
          <input id="class-name" className="asset-input mt-1" required maxLength={100} value={className} onChange={(event) => setClassName(event.target.value)} placeholder="Lá 1" disabled={busy} />
        </div>
        <div>
          <label className="asset-label" htmlFor="age-group">Nhóm tuổi</label>
          <select id="age-group" className="asset-input mt-1" value={ageGroupId} onChange={(event) => setAgeGroupId(event.target.value)} disabled={busy}>
            {ageGroups.map((group) => (
              <option key={group.ageGroupId} value={group.ageGroupId}>{group.name}</option>
            ))}
          </select>
        </div>
        {error && <p role="alert" className="asset-error">{error}</p>}
        {done && <p role="status" className="text-sm text-leaf">{done}</p>}
        <button className="asset-button-primary w-full" disabled={busy || !className.trim()}>{busy ? "Đang tạo…" : "Tạo lớp"}</button>
      </form>
    </Panel>
  );
}

function CreateSchoolYearForm({ api, onCreated }: { api: ClassroomApi; onCreated: (year: SchoolYear) => void }) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (endDate <= startDate) {
      setError("Ngày kết thúc phải sau ngày bắt đầu.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const created = await api.createSchoolYear({ name: name.trim(), startDate, endDate });
      setName("");
      setStartDate("");
      setEndDate("");
      onCreated(created);
    } catch (failure) {
      setError(classroomError(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel title="Thêm năm học">
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
        <button className="asset-button-secondary w-full" disabled={busy || !name.trim() || !startDate || !endDate}>{busy ? "Đang tạo…" : "Tạo năm học"}</button>
      </form>
    </Panel>
  );
}

/** The school years, newest first, each with an edit action (name and period). */
function SchoolYearsPanel({ api, years, onSaved }: { api: ClassroomApi; years: SchoolYear[]; onSaved: () => void }) {
  const [editing, setEditing] = useState<SchoolYear | null>(null);
  return (
    <Panel title="Năm học">
      <ul className="divide-y divide-line">
        {years.map((year) => (
          <li key={year.schoolYearId} className="flex items-center justify-between gap-3 py-2.5">
            <span className="min-w-0">
              <span className="block break-words font-semibold text-ink">{year.name}</span>
              <span className="block text-xs text-ink-soft">{formatDateOnly(year.startDate)} – {formatDateOnly(year.endDate)}</span>
            </span>
            <button type="button" className="asset-button-secondary shrink-0 px-3" onClick={() => setEditing(year)} aria-label={`Sửa năm học ${year.name}`}>
              Sửa
            </button>
          </li>
        ))}
      </ul>
      {editing && (
        <EditSchoolYearDialog
          api={api}
          year={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onSaved();
          }}
        />
      )}
    </Panel>
  );
}

function EditSchoolYearDialog({ api, year, onClose, onSaved }: { api: ClassroomApi; year: SchoolYear; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(year.name);
  const [startDate, setStartDate] = useState(year.startDate);
  const [endDate, setEndDate] = useState(year.endDate);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const unchanged = name.trim() === year.name && startDate === year.startDate && endDate === year.endDate;
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
      await api.updateSchoolYear(year.schoolYearId, {
        ...(name.trim() !== year.name ? { name: name.trim() } : {}),
        ...(startDate !== year.startDate ? { startDate } : {}),
        ...(endDate !== year.endDate ? { endDate } : {}),
      });
      onSaved();
    } catch (failure) {
      setError(classroomError(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title={`Sửa năm học ${year.name}`} onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <div>
          <label className="asset-label" htmlFor="edit-year-name">Tên năm học</label>
          <input id="edit-year-name" className="asset-input mt-1" required maxLength={50} value={name} onChange={(event) => setName(event.target.value)} disabled={busy} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="asset-label" htmlFor="edit-year-start">Bắt đầu</label>
            <input id="edit-year-start" type="date" className="asset-input mt-1" required value={startDate} onChange={(event) => setStartDate(event.target.value)} disabled={busy} />
          </div>
          <div>
            <label className="asset-label" htmlFor="edit-year-end">Kết thúc</label>
            <input id="edit-year-end" type="date" className="asset-input mt-1" required min={startDate || undefined} value={endDate} onChange={(event) => setEndDate(event.target.value)} disabled={busy} />
          </div>
        </div>
        <p className="text-xs leading-5 text-ink-soft">Đổi tên hoặc thời gian không ảnh hưởng lớp, trẻ và lịch sử chơi đã có.</p>
        {error && <p role="alert" className="asset-error">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="asset-button-secondary" onClick={onClose} disabled={busy}>Hủy</button>
          <button className="asset-button-primary" disabled={busy || unchanged || !name.trim() || !startDate || !endDate}>{busy ? "Đang lưu…" : "Lưu thay đổi"}</button>
        </div>
      </form>
    </Dialog>
  );
}
