"use client";
import Link from "next/link";
import { useState } from "react";
import type { FormEvent } from "react";
import type { ChildProfile, ClassroomDetail } from "@lumikids/shared";
import { AssignmentApi, classroomError } from "./api";
import type { ClassroomApi } from "./api";
import { AssignmentsPanel } from "./assignments-panel";
import { ClassroomShell, Dialog, ErrorBanner, Notice, Panel, StatusPill, TabLinks } from "./classroom-shell";
import { childStatusLabels, classroomStatusLabels, formatDateOnly, genderLabels, localToday } from "./format";
import { useClassroomSession } from "./use-classroom-session";
import { useResource } from "./use-resource";
import { RosterTools, useRoster } from "./roster-tools";

export type AdminClassroomTab = "overview" | "teachers" | "settings" | "assignments";

export function AdminClassroomDetailPage({ classId, tab = "overview" }: { classId: string; tab?: AdminClassroomTab }) {
  const { session, loading, api, allowed } = useClassroomSession("MANAGE_CLASSROOMS");
  if (loading || !session || !api) return <Notice>Đang kiểm tra phiên đăng nhập…</Notice>;
  if (!allowed) return <Notice>Bạn chưa có quyền quản lý lớp học.</Notice>;
  return <AdminClassroom key={`${session.user.userId}:${classId}`} api={api} classId={classId} tab={tab} />;
}

/** Runs one mutation at a time and keeps its error next to the section that triggered it. */
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
  return { busy, error, run, clear: () => setError("") };
}

function AdminClassroom({ api, classId, tab }: { api: ClassroomApi; classId: string; tab: AdminClassroomTab }) {
  const classroom = useResource((signal) => api.adminClassroom(classId, signal), classId);
  const [assignments] = useState(() => new AssignmentApi(api, classId, "admin"));
  const base = `/admin/classrooms/${classId}`;
  const back = { href: "/admin/classrooms", label: "Danh sách lớp" };
  if (!classroom.data)
    return (
      <ClassroomShell title="Lớp học" back={back}>
        {classroom.error ? <ErrorBanner message={classroom.error} onRetry={classroom.reload} /> : <p role="status">Đang tải lớp…</p>}
      </ClassroomShell>
    );
  const data = classroom.data;
  const archived = data.status === "ARCHIVED";
  return (
    <ClassroomShell
      title={data.className}
      eyebrow={`Năm học ${data.schoolYear.name} · ${data.ageGroup.name}`}
      back={back}
      actions={<StatusPill tone={archived ? "slate" : "green"}>{classroomStatusLabels[data.status]}</StatusPill>}
    >
      {classroom.error && <ErrorBanner message={classroom.error} onRetry={classroom.reload} />}
      {archived && <p className="mb-4 rounded-xl border border-line bg-paper px-4 py-3 text-sm text-ink-soft">Lớp đã lưu trữ: chỉ xem được, không thêm trẻ hoặc giáo viên.</p>}
      <TabLinks
        current={tab}
        tabs={[
          { id: "overview", label: "Danh sách trẻ", href: base, badge: data.children.length },
          { id: "teachers", label: "Giáo viên", href: `${base}?tab=teachers`, badge: data.teachers.length },
          { id: "settings", label: "Thông tin lớp", href: `${base}?tab=settings` },
          { id: "assignments", label: "Bài đã giao", href: `${base}?tab=assignments` },
        ]}
      />
      {tab === "assignments" && <AssignmentsPanel api={assignments} classId={classId} canAssign={false} />}
      {tab === "overview" && <ChildrenPanel api={api} classroom={data} onChange={classroom.replace} reload={classroom.reload} />}
      {tab === "teachers" && <TeachersPanel api={api} classroom={data} onChange={classroom.replace} />}
      {tab === "settings" && <SettingsPanel api={api} classroom={data} onChange={classroom.replace} />}
    </ClassroomShell>
  );
}

export function ChildrenPanel({
  api,
  classroom,
  onChange,
  reload,
  directoryMemoryKey,
}: {
  api: ClassroomApi;
  classroom: ClassroomDetail;
  onChange: (value: ClassroomDetail) => void;
  reload: () => void;
  directoryMemoryKey?: string;
}) {
  const archived = classroom.status === "ARCHIVED";
  const [editing, setEditing] = useState<ChildProfile | null>(null);
  const [moving, setMoving] = useState<ChildProfile | null>(null);
  const [adding, setAdding] = useState(false);
  const roster = useRoster(classroom.children, directoryMemoryKey);
  const [message, setMessage] = useState("");
  const directory = "/admin/children";
  return (
    <Panel title={`Trẻ trong lớp (${classroom.children.length})`} actions={!archived && (
      <div className="flex flex-wrap gap-2">
        <Link href={`${directory}?target=${classroom.classId}`} className="asset-button-secondary">Xếp trẻ có hồ sơ</Link>
        <button type="button" className="asset-button-primary" onClick={() => setAdding(true)}>Thêm hồ sơ</button>
      </div>
    )}>
      {message && <p role="status" className="mb-3 rounded-xl bg-leaf-soft p-3 text-sm text-leaf">{message}</p>}
      {classroom.children.length > 0 && <RosterTools {...roster} count={roster.children.length} />}
      {classroom.children.length === 0 ? (
        <p className="text-sm text-ink-soft">Lớp chưa có trẻ.</p>
      ) : (
        <ul className="divide-y divide-line">
          {roster.children.map((child) => (
            <li key={child.childId} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <Link className="break-words font-semibold text-leaf hover:underline" href={`/admin/classrooms/${classroom.classId}/children/${child.childId}${directoryMemoryKey ? "?from=directory" : ""}`}>
                  {child.fullName}
                </Link>
                <p className="text-sm text-ink-soft">
                  {formatDateOnly(child.dob)} · {genderLabels[child.gender]} · {child.loginCodeIssuedAt ? "Đã có mã" : "Chưa có mã"}
                </p>
              </div>
              {child.status === "DISABLED" && <StatusPill tone="red">{childStatusLabels.DISABLED}</StatusPill>}
              {!archived && (
                <div className="flex gap-2">
                  <button type="button" className="asset-button-secondary" onClick={() => setEditing(child)}>Sửa</button>
                  <button type="button" className="asset-button-secondary" onClick={() => setMoving(child)}>Chuyển lớp</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {classroom.children.length > 0 && roster.children.length === 0 && <p className="py-5 text-sm text-ink-soft">Không tìm thấy trẻ. Thử từ khóa hoặc trạng thái khác.</p>}
      {adding && <Dialog title="Thêm hồ sơ vào lớp" onClose={() => setAdding(false)} wide>
        <AddChildForm api={api} classId={classroom.classId} onAdded={(value, name) => {
          onChange(value);
          setAdding(false);
          roster.setQuery("");
          roster.setFilter("all");
          setMessage(`Đã thêm ${name} vào lớp ${classroom.className}.`);
        }} />
      </Dialog>}
      {editing && <EditChildDialog api={api} child={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
      {moving && (
        <TransferDialog
          api={api}
          child={moving}
          fromClassId={classroom.classId}
          onClose={() => setMoving(null)}
          onMoved={(destination) => {
            setMessage(`Đã chuyển ${moving.fullName} sang lớp ${destination.className}.`);
            setMoving(null);
            reload();
          }}
        />
      )}
    </Panel>
  );
}

function AddChildForm({ api, classId, onAdded }: { api: ClassroomApi; classId: string; onAdded: (value: ClassroomDetail, name: string) => void }) {
  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState<"MALE" | "FEMALE">("FEMALE");
  const mutation = useMutation();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void mutation.run(async () => {
      const name = fullName.trim();
      onAdded(await api.createChild({ fullName: name, dob, gender, classId }), name);
    });
  }
  return (
    <form onSubmit={submit}>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <label className="asset-label" htmlFor="child-name">Họ tên</label>
          <input id="child-name" className="asset-input mt-1" required maxLength={200} value={fullName} onChange={(event) => setFullName(event.target.value)} disabled={mutation.busy} />
        </div>
        <div>
          <label className="asset-label" htmlFor="child-dob">Ngày sinh</label>
          <input id="child-dob" type="date" className="asset-input mt-1" required max={localToday()} value={dob} onChange={(event) => setDob(event.target.value)} disabled={mutation.busy} />
        </div>
        <div>
          <label className="asset-label" htmlFor="child-gender">Giới tính</label>
          <select id="child-gender" className="asset-input mt-1" value={gender} onChange={(event) => setGender(event.target.value as "MALE" | "FEMALE")} disabled={mutation.busy}>
            <option value="FEMALE">{genderLabels.FEMALE}</option>
            <option value="MALE">{genderLabels.MALE}</option>
          </select>
        </div>
      </div>
      {mutation.error && <p role="alert" className="asset-error mt-3">{mutation.error}</p>}
      <button className="asset-button-primary mt-4" disabled={mutation.busy || !fullName.trim() || !dob}>{mutation.busy ? "Đang thêm…" : "Thêm trẻ"}</button>
    </form>
  );
}

export function EditChildDialog({ api, child, onClose, onSaved }: { api: ClassroomApi; child: ChildProfile; onClose: () => void; onSaved: () => void }) {
  const [fullName, setFullName] = useState(child.fullName);
  const [dob, setDob] = useState(child.dob);
  const [gender, setGender] = useState(child.gender);
  const [status, setStatus] = useState(child.status);
  const mutation = useMutation();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void mutation.run(async () => {
      await api.updateChild(child.childId, { fullName: fullName.trim(), dob, gender, status });
      onSaved();
    });
  }
  return (
    <Dialog title={`Sửa thông tin ${child.fullName}`} onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <div>
          <label className="asset-label" htmlFor="edit-name">Họ tên</label>
          <input id="edit-name" className="asset-input mt-1" required maxLength={200} value={fullName} onChange={(event) => setFullName(event.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="asset-label" htmlFor="edit-dob">Ngày sinh</label>
            <input id="edit-dob" type="date" className="asset-input mt-1" required max={localToday()} value={dob} onChange={(event) => setDob(event.target.value)} />
          </div>
          <div>
            <label className="asset-label" htmlFor="edit-gender">Giới tính</label>
            <select id="edit-gender" className="asset-input mt-1" value={gender} onChange={(event) => setGender(event.target.value as "MALE" | "FEMALE")}>
              <option value="FEMALE">{genderLabels.FEMALE}</option>
              <option value="MALE">{genderLabels.MALE}</option>
            </select>
          </div>
        </div>
        <fieldset>
          <legend className="asset-label">Tài khoản</legend>
          <div className="mt-2 flex flex-wrap gap-4 text-sm">
            {(["ACTIVE", "DISABLED"] as const).map((value) => (
              <label key={value} className="flex min-h-11 items-center gap-2">
                <input type="radio" name="child-status" checked={status === value} onChange={() => setStatus(value)} />
                {childStatusLabels[value]}
              </label>
            ))}
          </div>
          {status === "DISABLED" && <p className="mt-1 text-sm text-ink-soft">Trẻ bị khóa không đăng nhập được, kể cả khi đã có mã.</p>}
        </fieldset>
        {mutation.error && <p role="alert" className="asset-error">{mutation.error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="asset-button-secondary" onClick={onClose} disabled={mutation.busy}>Hủy</button>
          <button className="asset-button-primary" disabled={mutation.busy || !fullName.trim() || !dob}>{mutation.busy ? "Đang lưu…" : "Lưu"}</button>
        </div>
      </form>
    </Dialog>
  );
}

export function TransferDialog({
  api, child, fromClassId, initialTarget, onClose, onMoved,
}: {
  api: ClassroomApi;
  child: ChildProfile;
  fromClassId?: string;
  initialTarget?: string;
  onClose: () => void;
  onMoved: (value: ClassroomDetail) => void;
}) {
  const targets = useResource((signal) => api.adminClassrooms(new URLSearchParams({ status: "ACTIVE" }), signal), "targets");
  const options = (targets.data ?? []).filter((item) => item.classId !== fromClassId);
  const [classId, setClassId] = useState(initialTarget ?? "");
  const mutation = useMutation();
  const target = options.find((option) => option.classId === classId);
  const action = fromClassId ? "Chuyển lớp" : "Xếp lớp";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (target) void mutation.run(async () => onMoved(await api.transferChild(child.childId, target.classId)));
  }

  return (
    <Dialog title={`${action} cho ${child.fullName}`} onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        {targets.error && <ErrorBanner message={targets.error} onRetry={targets.reload} />}
        {targets.loading && !targets.error && !targets.data && <p role="status">Đang tải lớp…</p>}
        {targets.data && options.length === 0 && <p className="text-sm text-ink-soft">Chưa có lớp đang mở để chọn.</p>}
        {options.length > 0 && (
          <div>
            <label className="asset-label" htmlFor="transfer-target">Lớp nhận trẻ</label>
            <select id="transfer-target" className="asset-input mt-1" value={target?.classId ?? ""} onChange={(event) => setClassId(event.target.value)} required disabled={mutation.busy}>
              <option value="">Chọn lớp</option>
              {options.map((item) => (
                <option key={item.classId} value={item.classId}>
                  {item.className} · {item.ageGroup.name} · {item.schoolYear.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {mutation.error && <p role="alert" className="asset-error">{mutation.error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="asset-button-secondary" onClick={onClose} disabled={mutation.busy}>Hủy</button>
          <button className="asset-button-primary" disabled={mutation.busy || !target}>{mutation.busy ? "Đang lưu…" : action}</button>
        </div>
      </form>
    </Dialog>
  );
}

function TeachersPanel({ api, classroom, onChange }: { api: ClassroomApi; classroom: ClassroomDetail; onChange: (value: ClassroomDetail) => void }) {
  const archived = classroom.status === "ARCHIVED";
  const teachers = useResource(archived ? null : (signal) => api.teachers(signal), "teachers");
  const available = (teachers.data ?? []).filter((teacher) => !classroom.teachers.some((item) => item.userId === teacher.userId));
  const [userId, setUserId] = useState("");
  const mutation = useMutation();
  const picked = userId || available[0]?.userId || "";
  return (
    <Panel title={`Giáo viên (${classroom.teachers.length})`}>
      {classroom.teachers.length === 0 && <p className="text-sm text-ink-soft">Lớp chưa có giáo viên phụ trách.</p>}
      <ul className="space-y-2">
        {classroom.teachers.map((teacher) => (
          <li key={teacher.userId} className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-medium">{teacher.fullName}</p>
              <p className="break-all text-xs text-ink-soft">{teacher.email}</p>
            </div>
            <button
              type="button"
              className="asset-text-button text-red-700 hover:text-red-900"
              disabled={mutation.busy}
              aria-label={`Gỡ ${teacher.fullName} khỏi lớp`}
              onClick={() => {
                if (window.confirm(`Gỡ ${teacher.fullName} khỏi lớp ${classroom.className}? Giáo viên sẽ không xem được lớp này nữa.`))
                  void mutation.run(async () => onChange(await api.removeTeacher(classroom.classId, teacher.userId)));
              }}
            >
              Gỡ
            </button>
          </li>
        ))}
      </ul>
      {!archived && (
        <form
          className="mt-4 space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            void mutation.run(async () => {
              onChange(await api.addTeacher(classroom.classId, picked));
              setUserId("");
            });
          }}
        >
          <label className="asset-label" htmlFor="add-teacher">Thêm giáo viên</label>
          {teachers.error && <ErrorBanner message={teachers.error} onRetry={teachers.reload} />}
          {teachers.data && available.length === 0 ? (
            <p className="text-sm text-ink-soft">Mọi giáo viên đang hoạt động đã ở trong lớp.</p>
          ) : (
            <div className="flex gap-2">
              <select id="add-teacher" className="asset-input min-w-0 flex-1" value={picked} onChange={(event) => setUserId(event.target.value)} disabled={!teachers.data || mutation.busy}>
                {available.map((teacher) => (
                  <option key={teacher.userId} value={teacher.userId}>{teacher.fullName}</option>
                ))}
              </select>
              <button className="asset-button-primary" disabled={!picked || mutation.busy}>Thêm</button>
            </div>
          )}
        </form>
      )}
      {mutation.error && <p role="alert" className="asset-error mt-3">{mutation.error}</p>}
    </Panel>
  );
}

function SettingsPanel({ api, classroom, onChange }: { api: ClassroomApi; classroom: ClassroomDetail; onChange: (value: ClassroomDetail) => void }) {
  const ageGroups = useResource((signal) => api.ageGroups(signal), "age-groups");
  const [className, setClassName] = useState(classroom.className);
  const [ageGroupId, setAgeGroupId] = useState(classroom.ageGroup.ageGroupId);
  const mutation = useMutation();
  const archived = classroom.status === "ARCHIVED";
  const changed = className.trim() !== classroom.className || ageGroupId !== classroom.ageGroup.ageGroupId;
  return (
    <Panel title="Thông tin lớp">
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void mutation.run(async () => onChange(await api.updateClassroom(classroom.classId, { className: className.trim(), ageGroupId })));
        }}
      >
        <div>
          <label className="asset-label" htmlFor="settings-name">Tên lớp</label>
          <input id="settings-name" className="asset-input mt-1" required maxLength={100} value={className} onChange={(event) => setClassName(event.target.value)} disabled={archived || mutation.busy} />
        </div>
        <div>
          <label className="asset-label" htmlFor="settings-age">Nhóm tuổi</label>
          <select id="settings-age" className="asset-input mt-1" value={ageGroupId} onChange={(event) => setAgeGroupId(event.target.value)} disabled={archived || mutation.busy || !ageGroups.data}>
            {(ageGroups.data ?? [classroom.ageGroup]).map((group) => (
              <option key={group.ageGroupId} value={group.ageGroupId}>{group.name}</option>
            ))}
          </select>
        </div>
        {!archived && <button className="asset-button-secondary w-full" disabled={!changed || !className.trim() || mutation.busy}>Lưu thay đổi</button>}
      </form>
      <div className="mt-5 border-t border-line pt-4">
        {archived ? (
          <button type="button" className="asset-button-secondary w-full" disabled={mutation.busy} onClick={() => void mutation.run(async () => onChange(await api.updateClassroom(classroom.classId, { status: "ACTIVE" })))}>
            Mở lại lớp
          </button>
        ) : (
          <>
            <button
              type="button"
              className="asset-button-danger w-full"
              disabled={mutation.busy || classroom.children.length > 0}
              onClick={() => {
                if (window.confirm(`Lưu trữ lớp ${classroom.className}? Lớp sẽ chỉ còn để xem lại.`))
                  void mutation.run(async () => onChange(await api.updateClassroom(classroom.classId, { status: "ARCHIVED" })));
              }}
            >
              Lưu trữ lớp
            </button>
            {classroom.children.length > 0 && <p className="mt-2 text-xs text-ink-soft">Chuyển hết trẻ sang lớp khác trước khi lưu trữ.</p>}
          </>
        )}
      </div>
      {mutation.error && <p role="alert" className="asset-error mt-3">{mutation.error}</p>}
    </Panel>
  );
}
