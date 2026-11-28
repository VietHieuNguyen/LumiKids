"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { ClassroomSummary, ClassroomTeacher, SchoolYear } from "@lumikids/shared";
import { classroomError } from "./api";
import type { ClassroomApi } from "./api";
import { ClassroomShell, Dialog, ErrorBanner, Notice, Panel, StatusPill } from "./classroom-shell";
import { classroomStatusLabels, formatDateOnly } from "./format";
import { useClassroomSession } from "./use-classroom-session";
import { useResource } from "./use-resource";
import { useRowLink } from "./use-row-link";
import { KpiRow, SearchBox, StatusFilter } from "../admin/account-ui";
import { EmptyState, FilterSelect, Pagination, ResultCount, SortHeader, SortSelect, Toolbar, compareText, pageOf, pageSizeOf, sortRows, textMatches, useListState } from "../admin/data-table";
import type { SortDir } from "../admin/data-table";

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
  const list = useListState({ year: "", q: "", status: "ACTIVE", age: "", teachers: "", sort: "name", dir: "asc", page: "1", size: "25" });
  const { state } = list;
  // Default to the most recent school year (the API lists newest first).
  const schoolYearId =
    (state.year && years.data?.some((item) => item.schoolYearId === state.year) ? state.year : null) ?? years.data?.[0]?.schoolYearId ?? null;
  // A year has a few dozen classes: load them all once and filter here.
  const classrooms = useResource(
    schoolYearId ? (signal) => api.adminClassrooms(new URLSearchParams({ schoolYearId }), signal) : null,
    schoolYearId ?? "",
  );
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ classId: string; className: string } | null>(null);
  const year = years.data?.find((item) => item.schoolYearId === schoolYearId) ?? null;
  const all = classrooms.data ?? [];
  const byStatus = (status: string) => (status ? all.filter((item) => item.status === status) : all);
  const sortDir: SortDir = state.dir === "desc" ? "desc" : "asc";
  const compare: Record<string, (a: ClassroomSummary, b: ClassroomSummary) => number> = {
    name: (a, b) => compareText(a.className, b.className),
    age: (a, b) => a.ageGroup.minAge - b.ageGroup.minAge || compareText(a.className, b.className),
    teachers: (a, b) => a.teacherCount - b.teacherCount || compareText(a.className, b.className),
    children: (a, b) => a.childCount - b.childCount || compareText(a.className, b.className),
  };
  const matching = sortRows(
    byStatus(state.status).filter(
      (item) =>
        (!state.age || item.ageGroup.ageGroupId === state.age) &&
        (state.teachers !== "NONE" || item.teacherCount === 0) &&
        textMatches(state.q, item.className, item.ageGroup.name),
    ),
    compare[state.sort] ?? compare.name,
    sortDir,
  );
  const paged = pageOf(matching, Number(state.page) || 1, pageSizeOf(state.size));
  const onSort = (sort: string, dir: SortDir) => list.update({ sort, dir });
  const active = byStatus("ACTIVE");
  const withoutTeacher = active.filter((item) => item.teacherCount === 0).length;
  // The year filter is not a "filter" to clear: it picks which list is shown.
  const changed = list.changed - (state.year ? 1 : 0);
  const resetFilters = () => list.update({ q: "", status: "ACTIVE", age: "", teachers: "" });

  return (
    <ClassroomShell
      title="Lớp học"
      eyebrow="Quản trị"
      actions={
        year && ageGroups.data ? (
          <button type="button" className="lumi-button-sun" onClick={() => setCreating(true)}>
            <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true"><path d="M9 3v12M3 9h12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
            Thêm lớp
          </button>
        ) : undefined
      }
    >
      {(years.error || ageGroups.error) && <ErrorBanner message={years.error || ageGroups.error} onRetry={() => { years.reload(); ageGroups.reload(); }} />}
      {years.data?.length === 0 && (
        <Panel title="Chưa có năm học">
          <p className="text-sm text-ink-soft">
            <Link className="font-semibold text-leaf hover:underline" href="/admin/school-years">Tạo năm học</Link> trước khi thêm lớp.
          </p>
        </Panel>
      )}
      {classrooms.data && (
        <KpiRow
          items={[
            { label: "Lớp đang học", value: active.length },
            { label: "Trẻ trong các lớp", value: active.reduce((sum, item) => sum + item.childCount, 0) },
            { label: "Lớp chưa có giáo viên", value: withoutTeacher },
            { label: "Đã lưu trữ", value: byStatus("ARCHIVED").length },
          ]}
        />
      )}
      {created && (
        <p role="status" className="mb-4 rounded-lg bg-leaf-soft px-4 py-3 text-sm text-leaf">
          Đã tạo lớp {created.className}.{" "}
          <Link className="font-semibold underline" href={`/admin/classrooms/${created.classId}`}>Mở lớp để phân công giáo viên</Link>
        </p>
      )}

      {years.data && years.data.length > 0 && (
        <Panel
          title={year ? `Năm học ${year.name}` : "Lớp học"}
          description={year ? `${formatDateOnly(year.startDate)} – ${formatDateOnly(year.endDate)}. Năm học và nhóm tuổi sửa ở trang riêng.` : undefined}
          actions={
            <div className="flex flex-wrap gap-2 text-[13px]">
              <Link className="asset-button-secondary" href="/admin/school-years">Năm học</Link>
              <Link className="asset-button-secondary" href="/admin/age-groups">Nhóm tuổi</Link>
            </div>
          }
        >
          <div className="mb-3">
            <StatusFilter
              value={state.status}
              onChange={(status) => list.update({ status })}
              options={[
                { value: "ACTIVE", label: "Đang học", count: active.length },
                { value: "ARCHIVED", label: "Đã lưu trữ", count: byStatus("ARCHIVED").length },
                { value: "", label: "Tất cả", count: all.length },
              ]}
            />
          </div>
          <Toolbar>
            <div className="min-w-0">
              <label className="block text-xs font-medium text-ink-soft" htmlFor="school-year">Năm học</label>
              <select id="school-year" className="asset-input mt-1 w-full sm:w-auto" value={schoolYearId ?? ""} onChange={(event) => list.update({ year: event.target.value })}>
                {years.data.map((item) => (
                  <option key={item.schoolYearId} value={item.schoolYearId}>{item.name}</option>
                ))}
              </select>
            </div>
            <SearchBox id="class-search" label="Tìm lớp" placeholder="Tên lớp…" value={state.q} onChange={(q) => list.update({ q })} />
            <FilterSelect
              id="filter-age"
              label="Nhóm tuổi"
              value={state.age}
              onChange={(age) => list.update({ age })}
              options={[{ value: "", label: "Tất cả" }, ...(ageGroups.data ?? []).map((group) => ({ value: group.ageGroupId, label: group.name }))]}
            />
            <FilterSelect
              id="filter-teachers"
              label="Giáo viên"
              value={state.teachers}
              onChange={(teachers) => list.update({ teachers })}
              options={[
                { value: "", label: "Tất cả" },
                { value: "NONE", label: "Chưa có giáo viên" },
              ]}
            />
            <SortSelect
              id="class-sort"
              sort={state.sort}
              dir={sortDir}
              onSort={onSort}
              options={[
                { field: "name", label: "Tên lớp" },
                { field: "age", label: "Nhóm tuổi" },
                { field: "children", label: "Số trẻ" },
                { field: "teachers", label: "Số giáo viên" },
              ]}
            />
          </Toolbar>
          {classrooms.data && (
            <div className="mb-3">
              <ResultCount shown={matching.length} total={all.length} noun="lớp" changed={Math.max(0, changed)} onReset={resetFilters} />
            </div>
          )}
          {classrooms.error && <ErrorBanner message={classrooms.error} onRetry={classrooms.reload} />}
          {schoolYearId && classrooms.loading && !classrooms.data && <p role="status" className="py-6 text-sm text-ink-soft">Đang tải lớp…</p>}
          {classrooms.data && matching.length === 0 && (
            <EmptyState filtered={all.length > 0} title="Năm học này chưa có lớp" hint="Bấm “Thêm lớp” để tạo lớp đầu tiên." onReset={resetFilters} />
          )}
          {paged.rows.length > 0 && (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-b border-line bg-cream/60 text-ink-soft">
                    <tr>
                      <SortHeader label="Lớp" field="name" sort={state.sort} dir={sortDir} onSort={onSort} />
                      <SortHeader label="Nhóm tuổi" field="age" sort={state.sort} dir={sortDir} onSort={onSort} />
                      <SortHeader label="Giáo viên" field="teachers" sort={state.sort} dir={sortDir} onSort={onSort} align="right" />
                      <SortHeader label="Trẻ" field="children" sort={state.sort} dir={sortDir} onSort={onSort} align="right" />
                      <th scope="col" className="px-3 py-2 font-medium">Trạng thái</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium"><span className="sr-only">Thao tác</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {paged.rows.map((item) => (
                      <tr key={item.classId} {...rowLink(`/admin/classrooms/${item.classId}`)} className={`cursor-pointer hover:bg-cream/60 ${item.status === "ARCHIVED" ? "text-ink-soft" : ""}`}>
                        <td className="px-3 py-3">
                          <Link className="font-semibold text-ink hover:text-leaf hover:underline" href={`/admin/classrooms/${item.classId}`}>{item.className}</Link>
                        </td>
                        <td className="px-3 py-3">{item.ageGroup.name}</td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {item.teacherCount === 0 && item.status === "ACTIVE" ? <StatusPill tone="amber">Chưa có</StatusPill> : item.teacherCount}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">{item.childCount}</td>
                        <td className="whitespace-nowrap px-3 py-3">
                          <StatusPill tone={item.status === "ACTIVE" ? "green" : "slate"}>{classroomStatusLabels[item.status]}</StatusPill>
                        </td>
                        <td className="px-3 py-3 text-right">
                          {item.status === "ACTIVE" && (
                            <Link className="asset-button-secondary whitespace-nowrap" href={`/admin/children?target=${item.classId}`}>Xếp trẻ</Link>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="divide-y divide-line md:hidden">
                {paged.rows.map((item) => (
                  <li key={item.classId} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <Link className="font-semibold text-ink hover:text-leaf hover:underline" href={`/admin/classrooms/${item.classId}`}>{item.className}</Link>
                      <p className="text-xs text-ink-soft">{item.ageGroup.name} · {item.childCount} trẻ · {item.teacherCount} giáo viên</p>
                    </div>
                    {item.teacherCount === 0 && item.status === "ACTIVE" && <StatusPill tone="amber">Chưa có giáo viên</StatusPill>}
                    <StatusPill tone={item.status === "ACTIVE" ? "green" : "slate"}>{classroomStatusLabels[item.status]}</StatusPill>
                  </li>
                ))}
              </ul>
            </>
          )}
          <Pagination page={paged.page} pages={paged.pages} total={matching.length} size={pageSizeOf(state.size)} onPage={(value) => list.update({ page: String(value) })} onSize={(value) => list.update({ size: String(value) })} />
        </Panel>
      )}

      {creating && year && ageGroups.data && (
        <Dialog title={`Thêm lớp vào năm học ${year.name}`} onClose={() => setCreating(false)}>
          <CreateClassroomForm
            api={api}
            year={year}
            ageGroups={ageGroups.data}
            onCreated={(value) => {
              setCreating(false);
              setCreated(value);
              classrooms.reload();
            }}
          />
        </Dialog>
      )}
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
  onCreated: (value: { classId: string; className: string }) => void;
}) {
  const [className, setClassName] = useState("");
  const [ageGroupId, setAgeGroupId] = useState(ageGroups[0]?.ageGroupId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [teachers, setTeachers] = useState<ClassroomTeacher[] | null>(null);
  const [teacherIds, setTeacherIds] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    api.teachers().then((rows) => active && setTeachers(rows)).catch((failure: unknown) => active && setError(classroomError(failure)));
    return () => {
      active = false;
    };
  }, [api]);
  function toggleTeacher(userId: string) {
    setTeacherIds((current) => (current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || teacherIds.length === 0) return;
    setBusy(true);
    setError("");
    try {
      const created = await api.createClassroom({ className: className.trim(), schoolYearId: year.schoolYearId, ageGroupId, teacherUserIds: teacherIds });
      onCreated({ classId: created.classId, className: created.className });
    } catch (failure) {
      setError(classroomError(failure));
      setBusy(false);
    }
  }
  return (
    <form className="space-y-4" onSubmit={submit}>
      <div>
        <label className="asset-label" htmlFor="class-name">Tên lớp</label>
        <input id="class-name" className="asset-input mt-1" required autoFocus maxLength={100} value={className} onChange={(event) => setClassName(event.target.value)} placeholder="Lá 1" disabled={busy} />
      </div>
      <div>
        <label className="asset-label" htmlFor="age-group">Nhóm tuổi</label>
        <select id="age-group" className="asset-input mt-1" value={ageGroupId} onChange={(event) => setAgeGroupId(event.target.value)} disabled={busy}>
          {ageGroups.map((group) => (
            <option key={group.ageGroupId} value={group.ageGroupId}>{group.name}</option>
          ))}
        </select>
        <p className="mt-1 text-[13px] text-ink-soft">Trò chơi giao cho lớp phải cùng nhóm tuổi.</p>
      </div>
      <fieldset>
        <legend className="asset-label">Giáo viên phụ trách</legend>
        <p className="mt-1 text-[13px] text-ink-soft">Lớp cần ít nhất một giáo viên phụ trách.</p>
        {teachers === null && !error && <p className="mt-2 text-sm text-ink-soft">Đang tải danh sách giáo viên…</p>}
        {teachers && teachers.length === 0 && <p className="mt-2 text-sm text-ink-soft">Chưa có giáo viên nào. Hãy thêm giáo viên trước khi tạo lớp.</p>}
        {teachers && teachers.length > 0 && (
          <ul className="mt-2 space-y-2">
            {teachers.map((teacher) => (
              <li key={teacher.userId}>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={teacherIds.includes(teacher.userId)} onChange={() => toggleTeacher(teacher.userId)} disabled={busy} />
                  <span>{teacher.fullName}</span>
                  <span className="text-ink-soft">{teacher.email}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>
      {error && <p role="alert" className="asset-error">{error}</p>}
      <div className="flex justify-end">
        <button className="asset-button-primary" disabled={busy || !className.trim() || teacherIds.length === 0}>{busy ? "Đang tạo…" : "Tạo lớp"}</button>
      </div>
    </form>
  );
}
