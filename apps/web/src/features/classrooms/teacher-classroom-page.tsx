"use client";
import Link from "next/link";
import { useState } from "react";
import type { ClassroomChild, ClassroomDetail } from "@lumikids/shared";
import type { ClassroomApi } from "./api";
import { AssignmentApi } from "./api";
import { AssignmentsPanel } from "./assignments-panel";
import { ClassroomShell, ErrorBanner, Notice, Panel, StatusPill, TabLinks } from "./classroom-shell";
import { ageInYears, childStatusLabels, classroomStatusLabels, formatDateTime, genderLabels, localToday } from "./format";
import { GroupsPanel } from "./groups-panel";
import { LoginCodeDialog } from "./login-code-dialog";
import { useClassroomSession } from "./use-classroom-session";
import { useResource } from "./use-resource";

export type ClassroomTab = "assignments" | "children" | "groups";

export function TeacherClassroomPage({ classId, tab }: { classId: string; tab: ClassroomTab }) {
  const { session, loading, api, allowed, canIssueCodes, canAssign } = useClassroomSession("READ_OWN_CLASSROOMS");
  if (loading || !session || !api) return <Notice>Đang kiểm tra phiên đăng nhập…</Notice>;
  if (!allowed) return <Notice>Tài khoản này không phụ trách lớp học.</Notice>;
  return (
    <TeacherClassroom
      key={`${session.user.userId}:${classId}`}
      api={api}
      classId={classId}
      tab={tab}
      canIssueCodes={canIssueCodes}
      canAssign={canAssign}
    />
  );
}

function TeacherClassroom({
  api,
  classId,
  tab,
  canIssueCodes,
  canAssign,
}: {
  api: ClassroomApi;
  classId: string;
  tab: ClassroomTab;
  canIssueCodes: boolean;
  canAssign: boolean;
}) {
  const classroom = useResource((signal) => api.myClassroom(classId, signal), classId);
  const [assignments] = useState(() => new AssignmentApi(api, classId));
  const back = { href: "/teacher/classrooms", label: "Lớp của tôi" };
  if (!classroom.data)
    return (
      <ClassroomShell title="Lớp học" back={back}>
        {classroom.error ? <ErrorBanner message={classroom.error} onRetry={classroom.reload} /> : <p role="status" className="text-ink-soft">Đang tải lớp…</p>}
      </ClassroomShell>
    );
  const data = classroom.data;
  const active = data.status === "ACTIVE";
  const base = `/teacher/classrooms/${classId}`;
  return (
    <ClassroomShell
      title={`Lớp ${data.className}`}
      eyebrow={`${data.ageGroup.name} · Năm học ${data.schoolYear.name}`}
      back={back}
      actions={
        <>
          {!active && <StatusPill tone="slate">{classroomStatusLabels.ARCHIVED}</StatusPill>}
          {active && canAssign && (
            <Link href={`${base}/assignments/new`} className="lumi-button-sun">
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M9 3v12M3 9h12" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
              Giao bài mới
            </Link>
          )}
        </>
      }
    >
      {classroom.error && <ErrorBanner message={classroom.error} onRetry={classroom.reload} />}
      <TabLinks
        current={tab}
        tabs={[
          { id: "assignments", label: "Bài giao", href: base },
          { id: "children", label: `Trẻ (${data.children.length})`, href: `${base}?tab=children` },
          { id: "groups", label: "Nhóm", href: `${base}?tab=groups` },
        ]}
      />
      {tab === "assignments" && <AssignmentsPanel api={assignments} classId={classId} canAssign={canAssign && active} />}
      {tab === "children" && <ChildrenTab api={api} classroom={data} canIssueCodes={canIssueCodes} onChange={classroom.replace} />}
      {tab === "groups" && <GroupsPanel api={assignments} classroom={data} canEdit={canAssign && active} />}
    </ClassroomShell>
  );
}

function ChildrenTab({
  api,
  classroom,
  canIssueCodes,
  onChange,
}: {
  api: ClassroomApi;
  classroom: ClassroomDetail;
  canIssueCodes: boolean;
  onChange: (value: ClassroomDetail) => void;
}) {
  const [issuing, setIssuing] = useState<ClassroomChild | null>(null);
  const active = classroom.status === "ACTIVE";
  const today = localToday();
  const withoutCode = classroom.children.filter((child) => !child.loginCodeIssuedAt).length;
  return (
    <Panel
      title="Danh sách lớp"
      description={classroom.teachers.length ? `Giáo viên: ${classroom.teachers.map((teacher) => teacher.fullName).join(", ")}` : undefined}
      actions={withoutCode > 0 && active ? <StatusPill tone="amber">{withoutCode} trẻ chưa có mã</StatusPill> : undefined}
    >
      {classroom.children.length === 0 ? (
        <p className="text-sm text-ink-soft">Lớp chưa có trẻ đang học.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {classroom.children.map((child) => {
            const age = ageInYears(child.dob, today);
            return (
              <li key={child.childId} className="flex items-center gap-3 rounded-2xl border border-line bg-white p-3">
                <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-sun-soft font-display text-lg font-bold ring-1 ring-sun-edge/40">
                  {child.fullName.trim().split(/\s+/).pop()?.charAt(0).toUpperCase()}
                </span>
                <Link className="min-w-0 flex-1 rounded-lg" href={`/teacher/classrooms/${classroom.classId}/children/${child.childId}`}>
                  <span className="block break-words font-semibold text-ink hover:text-leaf">{child.fullName}</span>
                  <span className="block text-xs text-ink-soft">
                    {age === null ? "" : `${age} tuổi · `}
                    {genderLabels[child.gender]} · {child.loginCodeIssuedAt ? `Mã cấp ${formatDateTime(child.loginCodeIssuedAt)}` : "Chưa có mã"}
                  </span>
                </Link>
                {child.status === "DISABLED" && <StatusPill tone="red">{childStatusLabels.DISABLED}</StatusPill>}
                {canIssueCodes && active && child.status === "ACTIVE" && (
                  <button type="button" className="asset-button-secondary shrink-0 px-3" onClick={() => setIssuing(child)}>
                    {child.loginCodeIssuedAt ? "Mã mới" : "Cấp mã"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {issuing && (
        <LoginCodeDialog
          api={api}
          classId={classroom.classId}
          className={classroom.className}
          child={issuing}
          onClose={() => setIssuing(null)}
          onIssued={(issued) =>
            onChange({
              ...classroom,
              children: classroom.children.map((child) => (child.childId === issued.childId ? { ...child, loginCodeIssuedAt: issued.issuedAt } : child)),
            })
          }
        />
      )}
    </Panel>
  );
}
