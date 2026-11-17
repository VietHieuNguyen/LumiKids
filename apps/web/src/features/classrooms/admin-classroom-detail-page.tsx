"use client";
import Link from "next/link";
import { useState } from "react";
import type { FormEvent } from "react";
import type { ClassroomChild, ClassroomDetail } from "@lumikids/shared";
import { AssignmentApi, classroomError } from "./api";
import type { ClassroomApi } from "./api";
import { AssignmentsPanel } from "./assignments-panel";
import { ClassroomShell, Dialog, ErrorBanner, Notice, Panel, StatusPill, TabLinks } from "./classroom-shell";
import { childStatusLabels, classroomStatusLabels, formatDateOnly, genderLabels, localToday } from "./format";
import { useClassroomSession } from "./use-classroom-session";
import { useResource } from "./use-resource";

export type AdminClassroomTab = "overview" | "assignments";

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
          { id: "overview", label: `Trẻ (${data.children.length}) & giáo viên (${data.teachers.length})`, href: base },
          { id: "assignments", label: "Bài đã giao", href: `${base}?tab=assignments` },
        ]}
      />
      {tab === "assignments" ? (
        <AssignmentsPanel api={assignments} classId={classId} canAssign={false} />
      ) : (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <ChildrenPanel api={api} classroom={data} onChange={classroom.replace} reload={classroom.reload} />
        </div>
        <aside className="space-y-6">
          <TeachersPanel api={api} classroom={data} onChange={classroom.replace} />
          <SettingsPanel api={api} classroom={data} onChange={classroom.replace} />
        </aside>
      </div>
      )}
    </ClassroomShell>
  );
}

function ChildrenPanel({
  api,
  classroom,
  onChange,
  reload,
}: {
  api: ClassroomApi;
  classroom: ClassroomDetail;
  onChange: (value: ClassroomDetail) => void;
  reload: () => void;
}) {
  const archived = classroom.status === "ARCHIVED";
  const [editing, setEditing] = useState<ClassroomChild | null>(null);
  const [moving, setMoving] = useState<ClassroomChild | null>(null);
  return (
    <Panel title={`Trẻ trong lớp (${classroom.children.length})`} description="Bấm tên trẻ để xem kết quả chơi. Trẻ đăng nhập bằng mã do giáo viên của lớp cấp.">
      {classroom.children.length === 0 ? (
        <p className="text-sm text-ink-soft">Lớp chưa có trẻ.</p>
      ) : (
        <ul className="divide-y divide-line">
          {classroom.children.map((child) => (
            <li key={child.childId} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <Link className="break-words font-semibold text-leaf hover:underline" href={`/admin/classrooms/${classroom.classId}/children/${child.childId}`}>
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
      {!archived && <UnassignedChildren api={api} classroom={classroom} onPlaced={onChange} />}
      {!archived && <AddChildForm api={api} classId={classroom.classId} onAdded={onChange} />}
      {editing && <EditChildDialog api={api} child={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
      {moving && (
        <TransferDialog
          api={api}
          child={moving}
          classroom={classroom}
          onClose={() => setMoving(null)}
          onMoved={() => {
            setMoving(null);
            reload();
          }}
        />
      )}
    </Panel>
  );
}

/** Profiles without a class (e.g. created before classrooms) cannot sign in until they are placed in one. */
function UnassignedChildren({ api, classroom, onPlaced }: { api: ClassroomApi; classroom: ClassroomDetail; onPlaced: (value: ClassroomDetail) => void }) {
  const unassigned = useResource((signal) => api.unassignedChildren(signal), `unassigned:${classroom.children.length}`);
  const mutation = useMutation();
  if (!unassigned.data?.length && !unassigned.error) return null;
  return (
    <div className="mt-6 rounded-xl border border-sun-edge/40 bg-sun-soft p-4">
      <h3 className="font-semibold text-[#6b4600]">Trẻ chưa có lớp</h3>
      <p className="mt-1 text-sm text-[#6b4600]">Trẻ chưa có lớp thì chưa đăng nhập được. Xếp trẻ vào lớp này rồi giáo viên cấp mã.</p>
      {unassigned.error && <ErrorBanner message={unassigned.error} onRetry={unassigned.reload} />}
      <ul className="mt-3 divide-y divide-sun-edge/20">
        {(unassigned.data ?? []).map((child) => (
          <li key={child.childId} className="flex flex-wrap items-center gap-3 py-2">
            <span className="min-w-0 flex-1 break-words text-sm">
              <span className="font-semibold">{child.fullName}</span> · {formatDateOnly(child.dob)} · {genderLabels[child.gender]}
            </span>
            <button
              type="button"
              className="asset-button-secondary"
              disabled={mutation.busy}
              onClick={() => void mutation.run(async () => onPlaced(await api.transferChild(child.childId, classroom.classId)))}
            >
              Xếp vào lớp {classroom.className}
            </button>
          </li>
        ))}
      </ul>
      {mutation.error && <p role="alert" className="asset-error mt-3">{mutation.error}</p>}
    </div>
  );
}

function AddChildForm({ api, classId, onAdded }: { api: ClassroomApi; classId: string; onAdded: (value: ClassroomDetail) => void }) {
  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState<"MALE" | "FEMALE">("FEMALE");
  const mutation = useMutation();
  const [done, setDone] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDone("");
    void mutation.run(async () => {
      const name = fullName.trim();
      onAdded(await api.createChild({ fullName: name, dob, gender, classId }));
      setFullName("");
      setDob("");
      setDone(`Đã thêm ${name}. Giáo viên của lớp cấp mã đăng nhập cho trẻ.`);
    });
  }
  return (
    <form className="mt-6 rounded-xl border border-dashed border-line p-4" onSubmit={submit}>
      <h3 className="mb-3 font-semibold">Thêm trẻ vào lớp</h3>
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
      {done && <p role="status" className="mt-3 text-sm text-leaf">{done}</p>}
      <button className="asset-button-primary mt-4" disabled={mutation.busy || !fullName.trim() || !dob}>{mutation.busy ? "Đang thêm…" : "Thêm trẻ"}</button>
    </form>
  );
}

function EditChildDialog({ api, child, onClose, onSaved }: { api: ClassroomApi; child: ClassroomChild; onClose: () => void; onSaved: () => void }) {
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

function TransferDialog({
  api,
  child,
  classroom,
  onClose,
  onMoved,
}: {
  api: ClassroomApi;
  child: ClassroomChild;
  classroom: ClassroomDetail;
  onClose: () => void;
  onMoved: () => void;
}) {
  const targets = useResource((signal) => api.adminClassrooms(new URLSearchParams({ status: "ACTIVE" }), signal), "targets");
  const options = (targets.data ?? []).filter((item) => item.classId !== classroom.classId);
  const [classId, setClassId] = useState("");
  const mutation = useMutation();
  const target = classId || options[0]?.classId || "";
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void mutation.run(async () => {
      await api.transferChild(child.childId, target);
      onMoved();
    });
  }
  return (
    <Dialog title={`Chuyển lớp cho ${child.fullName}`} onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <p className="text-sm leading-6 text-ink-soft">
          Từ hôm nay trẻ học lớp mới. Giáo viên lớp {classroom.className} vẫn xem được các lượt chơi trong thời gian trẻ học lớp mình; giáo viên lớp mới chỉ thấy các lượt chơi từ khi trẻ chuyển đến.
        </p>
        {targets.error && <ErrorBanner message={targets.error} onRetry={targets.reload} />}
        {targets.loading && !targets.data && <p role="status" className="text-sm">Đang tải danh sách lớp…</p>}
        {targets.data && options.length === 0 && <p className="text-sm text-ink-soft">Chưa có lớp đang học nào khác.</p>}
        {options.length > 0 && (
          <div>
            <label className="asset-label" htmlFor="transfer-target">Lớp mới</label>
            <select id="transfer-target" className="asset-input mt-1" value={target} onChange={(event) => setClassId(event.target.value)}>
              {options.map((item) => (
                <option key={item.classId} value={item.classId}>
                  {item.className} · {item.ageGroup.name} · {item.schoolYear.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {mutation.error && <p role="alert" className="asset-error">{mutation.error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="asset-button-secondary" onClick={onClose} disabled={mutation.busy}>Hủy</button>
          <button className="asset-button-primary" disabled={mutation.busy || !target}>{mutation.busy ? "Đang chuyển…" : "Chuyển lớp"}</button>
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
