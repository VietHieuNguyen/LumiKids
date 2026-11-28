"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { AdminChild, AdminChildPick, ClassroomSummary } from "@lumikids/shared";
import { classroomError } from "./api";
import type { ClassroomApi } from "./api";
import { AddChildForm, EditChildDialog } from "./admin-classroom-detail-page";
import { ClassroomShell, Dialog, ErrorBanner, Notice, Panel, StatusPill } from "./classroom-shell";
import { ChildStatusDialog, MoveChildrenDialog } from "./child-batch-dialogs";
import { ageInYears, formatDate, formatDateOnly, genderLabels, localToday } from "./format";
import { useClassroomSession } from "./use-classroom-session";
import { useResource } from "./use-resource";
import { KpiRow, SearchBox } from "../admin/account-ui";
import {
  EmptyState,
  FilterSelect,
  Pagination,
  ResultCount,
  SelectBox,
  SelectionBar,
  SortHeader,
  SortSelect,
  Toolbar,
  pageSizeOf,
  toParams,
  useDebounced,
  useListState,
  useServerSelection,
} from "../admin/data-table";
import type { SortDir } from "../admin/data-table";

export function AdminChildrenPage({ initialTarget }: { initialTarget?: string }) {
  const { session, loading, api, allowed } = useClassroomSession("MANAGE_CLASSROOMS");
  if (loading || !session || !api) return <Notice>Đang kiểm tra phiên đăng nhập…</Notice>;
  if (!allowed) return <Notice>Bạn chưa có quyền quản lý trẻ.</Notice>;
  return <Directory key={session.user.userId} api={api} initialTarget={initialTarget} />;
}

const pickOf = (child: AdminChild): AdminChildPick => ({
  childId: child.childId,
  fullName: child.fullName,
  status: child.status,
  classId: child.currentClass?.classId ?? null,
  managedByFamily: child.managedByFamily,
});

type Dialogs =
  | { kind: "move"; picks: AdminChildPick[] }
  | { kind: "status"; picks: AdminChildPick[]; status: "ACTIVE" | "DISABLED" }
  | { kind: "edit"; child: AdminChild }
  | { kind: "create" }
  | null;

/**
 * Every child in the school, paged on the server. `?class=` (a class id or "none") and `?target=` (the class
 * to place children into, from a class page) keep working as deep links.
 */
function Directory({ api, initialTarget }: { api: ClassroomApi; initialTarget?: string }) {
  const list = useListState({
    q: "",
    class: initialTarget ? "none" : "",
    managed: "",
    code: "",
    status: "",
    sort: "name",
    dir: "asc",
    page: "1",
    size: "25",
  });
  const { state } = list;
  const [search, setSearch] = useState(state.q);
  const q = useDebounced(search.trim());
  useEffect(() => {
    if (q !== state.q) list.update({ q });
    // Only the settled text pushes into the list state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  const filter = { q: state.q, classId: state.class, managed: state.managed, code: state.code, status: state.status };
  const filterKey = toParams(filter).toString();
  const params = toParams({ ...filter, sort: state.sort, dir: state.dir, page: state.page, pageSize: pageSizeOf(state.size) });
  const children = useResource((signal) => api.adminChildren(params, signal), params.toString());
  const classes = useResource((signal) => api.adminClassrooms(new URLSearchParams({ status: "ACTIVE" }), signal), "active");
  const page = Number(state.page) || 1;
  const total = children.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSizeOf(state.size)));
  // A batch can leave the current page empty (the rows no longer match): step back to the last page.
  useEffect(() => {
    if (children.data && !children.loading && page > pages) list.update({ page: String(pages) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children.data, children.loading, page, pages]);
  const rows = children.data?.items ?? [];
  const selection = useServerSelection<AdminChildPick>({
    idOf: (pick) => pick.childId,
    pageRows: rows.map(pickOf),
    total,
    resetKey: filterKey,
    loadAll: () => api.adminChildIds(toParams(filter)),
  });
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [notice, setNotice] = useState("");
  const today = localToday();
  const target = classes.data?.find((item) => item.classId === initialTarget);
  const counts = children.data?.counts;
  const onSort = (sort: string, dir: SortDir) => list.update({ sort, dir });
  const refresh = () => {
    children.reload();
    classes.reload();
  };
  const closeBatch = () => {
    setDialog(null);
    selection.clear();
  };
  const selected = selection.selected;
  const anyActive = selected.some((pick) => pick.status === "ACTIVE");
  const anyDisabled = selected.some((pick) => pick.status === "DISABLED");
  const filtered = list.changed > 0;

  return (
    <ClassroomShell
      title="Trẻ"
      eyebrow="Quản trị"
      back={{ href: "/admin", label: "Tổng quan" }}
      actions={
        <button type="button" className="lumi-button-sun" onClick={() => setDialog({ kind: "create" })}>
          <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true"><path d="M9 3v12M3 9h12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
          Thêm trẻ
        </button>
      }
    >
      {counts && (
        <KpiRow
          items={[
            { label: "Hồ sơ trẻ", value: counts.all },
            { label: "Chưa xếp lớp", value: counts.unassigned },
            { label: "Chưa có mã đăng nhập", value: counts.withoutCode, hint: "Hồ sơ đang hoạt động" },
            { label: "Đã khóa", value: counts.disabled },
          ]}
        />
      )}
      {target && (
        <p role="status" className="mb-4 rounded-lg border border-leaf/30 bg-leaf-soft px-4 py-3 text-sm">
          Đang xếp trẻ cho lớp <strong>{target.className}</strong>. Chọn trẻ rồi bấm “Xếp lớp”; lớp này đã được chọn sẵn.
        </p>
      )}
      {notice && <p role="status" className="mb-4 rounded-lg bg-leaf-soft px-4 py-3 text-sm text-leaf">{notice}</p>}

      <Panel title="Danh sách trẻ" description="Tìm, lọc theo lớp, nguồn hồ sơ và mã đăng nhập; chọn nhiều trẻ để xếp lớp, chuyển lớp hoặc khóa hồ sơ.">
        <Toolbar>
          <SearchBox id="child-search" label="Tìm trẻ theo tên" placeholder="Tên trẻ…" value={search} onChange={setSearch} />
          <FilterSelect
            id="filter-class"
            label="Lớp"
            value={state.class}
            onChange={(value) => list.update({ class: value })}
            options={[
              { value: "", label: "Tất cả" },
              { value: "none", label: "Chưa xếp lớp", count: counts?.unassigned },
              ...(classes.data ?? []).map((item) => ({ value: item.classId, label: `${item.className} · ${item.schoolYear.name}`, count: item.childCount })),
              // A deep link to a class that is no longer open still shows what is filtered.
              ...(state.class && state.class !== "none" && classes.data && !classes.data.some((item) => item.classId === state.class)
                ? [{ value: state.class, label: "Lớp không còn mở" }]
                : []),
            ]}
          />
          <FilterSelect
            id="filter-managed"
            label="Hồ sơ"
            value={state.managed}
            onChange={(value) => list.update({ managed: value })}
            options={[
              { value: "", label: "Tất cả" },
              { value: "SCHOOL", label: "Trường quản lý" },
              { value: "FAMILY", label: "Gia đình quản lý" },
            ]}
          />
          <FilterSelect
            id="filter-code"
            label="Mã đăng nhập"
            value={state.code}
            onChange={(value) => list.update({ code: value })}
            options={[
              { value: "", label: "Tất cả" },
              { value: "HAS", label: "Đã cấp" },
              { value: "NONE", label: "Chưa cấp" },
            ]}
          />
          <FilterSelect
            id="filter-status"
            label="Trạng thái"
            value={state.status}
            onChange={(value) => list.update({ status: value })}
            options={[
              { value: "", label: "Tất cả" },
              { value: "ACTIVE", label: "Đang hoạt động" },
              { value: "DISABLED", label: "Đã khóa" },
            ]}
          />
          <SortSelect
            id="child-sort"
            sort={state.sort}
            dir={state.dir === "desc" ? "desc" : "asc"}
            onSort={onSort}
            options={[
              { field: "name", label: "Họ tên" },
              { field: "dob", label: "Ngày sinh" },
              { field: "createdAt", label: "Ngày tạo hồ sơ" },
            ]}
          />
        </Toolbar>
        <div className="mb-3 flex items-center justify-between gap-3">
          {children.data && (
            <ResultCount
              shown={total}
              total={counts?.all ?? total}
              noun="trẻ"
              changed={list.changed}
              onReset={() => {
                setSearch("");
                list.reset();
              }}
            />
          )}
          {children.loading && children.data && <p role="status" className="text-[13px] text-ink-soft">Đang tải…</p>}
        </div>

        {children.error && <ErrorBanner message={children.error} onRetry={children.reload} />}
        {classes.error && <ErrorBanner message={classes.error} onRetry={classes.reload} />}
        {!children.data && !children.error && <p role="status" className="py-6 text-sm text-ink-soft">Đang tải danh sách trẻ…</p>}

        <SelectionBar selection={selection} noun="trẻ">
          <button type="button" className="asset-button-primary" onClick={() => setDialog({ kind: "move", picks: selected })}>Xếp / chuyển lớp</button>
          {anyActive && <button type="button" className="asset-button-secondary" onClick={() => setDialog({ kind: "status", picks: selected, status: "DISABLED" })}>Khóa hồ sơ</button>}
          {anyDisabled && <button type="button" className="asset-button-secondary" onClick={() => setDialog({ kind: "status", picks: selected, status: "ACTIVE" })}>Mở khóa</button>}
        </SelectionBar>

        {children.data && rows.length === 0 && !children.loading && (
          <EmptyState
            filtered={filtered}
            title="Chưa có hồ sơ trẻ"
            hint="Thêm trẻ vào một lớp đang mở, hoặc phụ huynh tự tạo hồ sơ cho con."
            onReset={() => {
              setSearch("");
              list.reset();
            }}
          />
        )}

        {rows.length > 0 && (
          <div className={children.loading ? "opacity-60 transition-opacity" : "transition-opacity"} aria-busy={children.loading}>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="border-b border-line bg-cream/60 text-ink-soft">
                  <tr>
                    <th scope="col" className="w-10 py-2 pl-3 pr-0">
                      <span className="flex h-8 items-center">
                        <SelectBox checked={selection.allOnPage} mixed={selection.someOnPage} onChange={selection.togglePage} label="Chọn tất cả trẻ trên trang này" />
                      </span>
                    </th>
                    <SortHeader label="Trẻ" field="name" sort={state.sort} dir={state.dir === "desc" ? "desc" : "asc"} onSort={onSort} className="w-[28%]" />
                    <SortHeader label="Ngày sinh" field="dob" sort={state.sort} dir={state.dir === "desc" ? "desc" : "asc"} onSort={onSort} />
                    <th scope="col" className="px-3 py-2 font-medium">Lớp hiện tại</th>
                    <th scope="col" className="px-3 py-2 font-medium">Mã đăng nhập</th>
                    <SortHeader label="Tạo hồ sơ" field="createdAt" sort={state.sort} dir={state.dir === "desc" ? "desc" : "asc"} onSort={onSort} />
                    <th scope="col" className="px-3 py-2 text-right font-medium"><span className="sr-only">Thao tác</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((child) => (
                    <tr key={child.childId} className={`align-top ${child.status === "DISABLED" ? "text-ink-soft" : ""} ${selection.has(child.childId) ? "bg-leaf-soft/40" : "hover:bg-cream/50"}`}>
                      <td className="py-3 pl-3 pr-0">
                        <span className="flex h-8 items-center">
                          <SelectBox checked={selection.has(child.childId)} onChange={() => selection.toggle(pickOf(child))} label={`Chọn ${child.fullName}`} />
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <p className="break-words font-semibold text-ink">{child.fullName}</p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {child.managedByFamily && <StatusPill tone="blue">Gia đình quản lý</StatusPill>}
                          {child.status === "DISABLED" && <StatusPill tone="red">Đã khóa</StatusPill>}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <p className="tabular-nums">{formatDateOnly(child.dob)}</p>
                        <p className="text-xs text-ink-soft">{genderLabels[child.gender]} · {ageInYears(child.dob, today) ?? "?"} tuổi</p>
                      </td>
                      <td className="px-3 py-3"><ClassCell child={child} /></td>
                      <td className="whitespace-nowrap px-3 py-3"><CodeCell child={child} /></td>
                      <td className="whitespace-nowrap px-3 py-3 tabular-nums text-ink-soft">{formatDate(child.createdAt)}</td>
                      <td className="px-3 py-3"><RowActions child={child} onEdit={() => setDialog({ kind: "edit", child })} onMove={() => setDialog({ kind: "move", picks: [pickOf(child)] })} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mb-2 flex items-center gap-2 md:hidden">
              <SelectBox checked={selection.allOnPage} mixed={selection.someOnPage} onChange={selection.togglePage} label="Chọn tất cả trẻ trên trang này" />
              <span className="text-[13px] text-ink-soft">Chọn cả trang</span>
            </div>
            <ul className="divide-y divide-line md:hidden">
              {rows.map((child) => (
                <li key={child.childId} className={`py-4 ${selection.has(child.childId) ? "bg-leaf-soft/40" : ""}`}>
                  <div className="flex items-start gap-3">
                    <SelectBox checked={selection.has(child.childId)} onChange={() => selection.toggle(pickOf(child))} label={`Chọn ${child.fullName}`} />
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-semibold">{child.fullName}</p>
                      <p className="text-xs text-ink-soft">{formatDateOnly(child.dob)} · {genderLabels[child.gender]} · {ageInYears(child.dob, today) ?? "?"} tuổi</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[13px]">
                        <ClassCell child={child} />
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <CodeCell child={child} />
                        {child.managedByFamily && <StatusPill tone="blue">Gia đình quản lý</StatusPill>}
                        {child.status === "DISABLED" && <StatusPill tone="red">Đã khóa</StatusPill>}
                      </div>
                      <div className="mt-3"><RowActions child={child} onEdit={() => setDialog({ kind: "edit", child })} onMove={() => setDialog({ kind: "move", picks: [pickOf(child)] })} /></div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
        <Pagination page={Math.min(page, pages)} pages={pages} total={total} size={pageSizeOf(state.size)} onPage={(value) => list.update({ page: String(value) })} onSize={(value) => list.update({ size: String(value) })} />
      </Panel>

      {dialog?.kind === "move" && (
        <MoveChildrenDialog
          api={api}
          picks={dialog.picks}
          classes={classes.data ?? []}
          initialTarget={target?.classId ?? ""}
          onClose={closeBatch}
          onDone={refresh}
        />
      )}
      {dialog?.kind === "status" && <ChildStatusDialog api={api} picks={dialog.picks} status={dialog.status} onClose={closeBatch} onDone={refresh} />}
      {dialog?.kind === "edit" && (
        <EditChildDialog
          api={api}
          child={dialog.child}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            setNotice(`Đã lưu hồ sơ ${dialog.child.fullName}.`);
            children.reload();
          }}
        />
      )}
      {dialog?.kind === "create" && (
        <CreateChildDialog
          api={api}
          classes={classes.data ?? []}
          initialClass={target?.classId ?? (state.class !== "none" ? state.class : "")}
          onClose={() => setDialog(null)}
          onAdded={(name, className) => {
            setDialog(null);
            setNotice(`Đã thêm ${name} vào lớp ${className}.`);
            refresh();
          }}
        />
      )}
    </ClassroomShell>
  );
}

function ClassCell({ child }: { child: AdminChild }) {
  if (!child.currentClass) return <span className="text-ink-soft">Chưa xếp lớp</span>;
  return (
    <span className="min-w-0">
      <Link className="font-medium text-ink underline-offset-4 hover:text-leaf hover:underline" href={`/admin/classrooms/${child.currentClass.classId}`}>{child.currentClass.className}</Link>
      <span className="block text-xs text-ink-soft">{child.currentClass.ageGroupName} · {child.currentClass.schoolYearName}</span>
    </span>
  );
}

function CodeCell({ child }: { child: AdminChild }) {
  return child.loginCodeIssuedAt ? (
    <StatusPill tone="green">Đã cấp {formatDate(child.loginCodeIssuedAt)}</StatusPill>
  ) : (
    <StatusPill tone="amber">Chưa cấp</StatusPill>
  );
}

function RowActions({ child, onEdit, onMove }: { child: AdminChild; onEdit: () => void; onMove: () => void }) {
  // A family profile without a class joins only through the guardian's consented request.
  const canMove = child.status === "ACTIVE" && (child.currentClass !== null || !child.managedByFamily);
  return (
    <div className="flex flex-wrap justify-start gap-2 md:justify-end">
      <button type="button" className="asset-button-secondary" onClick={onEdit}>Sửa</button>
      {canMove && (
        <button type="button" className="asset-button-secondary" onClick={onMove}>{child.currentClass ? "Chuyển lớp" : "Xếp lớp"}</button>
      )}
    </div>
  );
}

/** A school profile always starts in a class (the API requires one), so the class is chosen first. */
function CreateChildDialog({
  api,
  classes,
  initialClass,
  onClose,
  onAdded,
}: {
  api: ClassroomApi;
  classes: readonly ClassroomSummary[];
  initialClass: string;
  onClose: () => void;
  onAdded: (name: string, className: string) => void;
}) {
  const [classId, setClassId] = useState(classes.some((item) => item.classId === initialClass) ? initialClass : "");
  const chosen = classes.find((item) => item.classId === classId);
  const unassigned = classId === UNASSIGNED;
  return (
    <Dialog title="Thêm trẻ" onClose={onClose} wide>
      <div className="mb-4">
        <label className="asset-label" htmlFor="create-child-class">Lớp</label>
        <select id="create-child-class" className="asset-input mt-1" value={classId} onChange={(event) => setClassId(event.target.value)} required>
          <option value="">Chọn lớp đang mở</option>
          <option value={UNASSIGNED}>Chưa xếp lớp (xếp lớp sau)</option>
          {classes.map((item) => (
            <option key={item.classId} value={item.classId}>{item.className} · {item.ageGroup.name} · {item.schoolYear.name}</option>
          ))}
        </select>
        {!classes.length && <p className="mt-2 text-[13px] text-ink-soft">Chưa có lớp đang mở. <Link className="font-medium underline" href="/admin/classrooms">Tạo lớp</Link> trước.</p>}
      </div>
      {unassigned ? (
        <UnassignedChildForm api={api} onAdded={(name) => onAdded(name, "chưa xếp lớp")} />
      ) : chosen ? (
        <AddChildForm key={chosen.classId} api={api} classId={chosen.classId} onAdded={(_, name) => onAdded(name, chosen.className)} />
      ) : (
        <p className="text-sm text-ink-soft">Chọn lớp để nhập thông tin trẻ. Hồ sơ do phụ huynh tạo được thêm từ trang gia đình.</p>
      )}
    </Dialog>
  );
}

const UNASSIGNED = "__unassigned__";

/** Admin creates a child profile first; the class can be set later (school rule: a child may have no class). */
function UnassignedChildForm({ api, onAdded }: { api: ClassroomApi; onAdded: (name: string) => void }) {
  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState<"MALE" | "FEMALE">("FEMALE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const name = fullName.trim();
      await api.createUnassignedChild({ fullName: name, dob, gender });
      onAdded(name);
    } catch (failure) {
      setError(classroomError(failure));
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <label className="asset-label" htmlFor="unassigned-name">Họ tên</label>
          <input id="unassigned-name" className="asset-input mt-1" required maxLength={200} value={fullName} onChange={(event) => setFullName(event.target.value)} disabled={busy} />
        </div>
        <div>
          <label className="asset-label" htmlFor="unassigned-dob">Ngày sinh</label>
          <input id="unassigned-dob" type="date" className="asset-input mt-1" required max={localToday()} value={dob} onChange={(event) => setDob(event.target.value)} disabled={busy} />
        </div>
        <div>
          <label className="asset-label" htmlFor="unassigned-gender">Giới tính</label>
          <select id="unassigned-gender" className="asset-input mt-1" value={gender} onChange={(event) => setGender(event.target.value as "MALE" | "FEMALE")} disabled={busy}>
            <option value="FEMALE">{genderLabels.FEMALE}</option>
            <option value="MALE">{genderLabels.MALE}</option>
          </select>
        </div>
      </div>
      {error && <p role="alert" className="asset-error mt-3">{error}</p>}
      <button className="asset-button-primary mt-4" disabled={busy || !fullName.trim() || !dob}>{busy ? "Đang thêm…" : "Thêm hồ sơ"}</button>
    </form>
  );
}
