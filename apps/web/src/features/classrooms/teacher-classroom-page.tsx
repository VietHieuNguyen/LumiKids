"use client";
import Link from "next/link";
import { useState } from "react";
import { createPortal } from "react-dom";
import type { ClassroomChild, ClassroomDetail } from "@lumikids/shared";
import type { ClassroomApi } from "./api";
import { AssignmentApi } from "./api";
import { AssignmentsPanel } from "./assignments-panel";
import { ClassroomShell, ErrorBanner, Notice, Panel, StatusPill, TabLinks } from "./classroom-shell";
import { ageInYears, childStatusLabels, classroomStatusLabels, formatDateTime, genderLabels, localToday } from "./format";
import { FamilyRequestsPanel } from "./family-requests-panel";
import { GroupsPanel } from "./groups-panel";
import { LoginCodeDialog } from "./login-code-dialog";
import { useClassroomSession } from "./use-classroom-session";
import { useResource } from "./use-resource";
import { BatchOutcome, ClassroomBatchDialog } from "./classroom-batch-dialog";
import { RosterTools, useRoster } from "./roster-tools";

export type ClassroomTab = "assignments" | "children" | "groups" | "families";

export function TeacherClassroomPage({ classId, tab }: { classId: string; tab: ClassroomTab }) {
  const { session, loading, api, allowed, canIssueCodes, canAssign, canInvite } = useClassroomSession("READ_OWN_CLASSROOMS");
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
      canInvite={canInvite}
    />
  );
}

function TeacherClassroom({
  api,
  classId,
  tab,
  canIssueCodes,
  canAssign,
  canInvite,
}: {
  api: ClassroomApi;
  classId: string;
  tab: ClassroomTab;
  canIssueCodes: boolean;
  canAssign: boolean;
  canInvite: boolean;
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
          { id: "children", label: "Danh sách trẻ", href: `${base}?tab=children`, badge: data.children.length },
          { id: "assignments", label: "Bài đã giao", href: `${base}?tab=assignments` },
          { id: "groups", label: "Nhóm", href: `${base}?tab=groups` },
          ...(canInvite ? [{ id: "families", label: "Phụ huynh", href: `${base}?tab=families` }] : []),
        ]}
      />
      {tab === "assignments" && <AssignmentsPanel api={assignments} classId={classId} canAssign={canAssign && active} />}
      {tab === "children" && <ChildrenTab api={api} classroom={data} canIssueCodes={canIssueCodes} canAssign={canAssign} onChange={classroom.replace} />}
      {tab === "groups" && <GroupsPanel api={assignments} classroom={data} canEdit={canAssign && active} />}
      {tab === "families" && canInvite && <FamilyRequestsPanel api={api} classId={classId} className={data.className} canEdit={active} />}
    </ClassroomShell>
  );
}

function ChildrenTab({
  api,
  classroom,
  canIssueCodes,
  canAssign,
  onChange,
}: {
  api: ClassroomApi;
  classroom: ClassroomDetail;
  canIssueCodes: boolean;
  canAssign: boolean;
  onChange: (value: ClassroomDetail) => void;
}) {
  const [issuing, setIssuing] = useState<ClassroomChild | null>(null);
  const [bulk, setBulk] = useState(false);
  const roster = useRoster(classroom.children);
  const active = classroom.status === "ACTIVE";
  const today = localToday();
  const eligible = classroom.children.filter((child) => child.status === "ACTIVE" && !child.loginCodeIssuedAt);
  const [batchPeople, setBatchPeople] = useState<{ id: string; name: string }[]>([]);
  const withoutCode = eligible.length;
  return (
    <Panel
      title="Danh sách lớp"
      description={classroom.teachers.length ? `Giáo viên: ${classroom.teachers.map((teacher) => teacher.fullName).join(", ")}` : undefined}
      actions={withoutCode > 0 && active ? (
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone="amber">{withoutCode} trẻ chưa có mã</StatusPill>
          {canIssueCodes && <button type="button" className="asset-button-primary" onClick={() => {
            setBatchPeople(eligible.map((child) => ({ id: child.childId, name: child.fullName })));
            setBulk(true);
          }}>Cấp mã hàng loạt</button>}
        </div>
      ) : undefined}
    >
      {classroom.children.length > 0 && <RosterTools {...roster} count={roster.children.length} />}
      {classroom.children.length === 0 ? (
        <p className="text-sm text-ink-soft">Lớp chưa có trẻ đang học.</p>
      ) : (
        <ul className="divide-y divide-line">
          {roster.children.map((child) => {
            const age = ageInYears(child.dob, today);
            return (
              <li key={child.childId} className="flex flex-wrap items-center gap-3 py-3">
                <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-sun-soft font-display text-lg font-bold ring-1 ring-sun-edge/40">
                  {child.fullName.trim().split(/\s+/).pop()?.charAt(0).toUpperCase()}
                </span>
                <Link className="min-w-0 flex-1 basis-40 rounded-lg" href={`/teacher/classrooms/${classroom.classId}/children/${child.childId}`}>
                  <span className="block break-words font-semibold text-ink hover:text-leaf">{child.fullName}</span>
                  <span className="block text-xs text-ink-soft">
                    {age === null ? "" : `${age} tuổi · `}
                    {genderLabels[child.gender]} · {child.loginCodeIssuedAt ? `Mã cấp ${formatDateTime(child.loginCodeIssuedAt)}` : "Chưa có mã"}
                  </span>
                </Link>
                {child.status === "DISABLED" && <StatusPill tone="red">{childStatusLabels.DISABLED}</StatusPill>}
                {active && child.status === "ACTIVE" && <div className="flex flex-wrap gap-2">
                {canAssign && <Link className="asset-button-secondary" href={`/teacher/classrooms/${classroom.classId}/assignments/new?child=${child.childId}`}>Giao bài</Link>}
                {canIssueCodes && (
                  <button type="button" className={child.loginCodeIssuedAt ? "asset-button-secondary" : "asset-button-primary"} onClick={() => setIssuing(child)}>
                    {child.loginCodeIssuedAt ? "Cấp mã mới" : "Cấp mã"}
                  </button>
                )}
                </div>}
              </li>
            );
          })}
        </ul>
      )}
      {classroom.children.length > 0 && roster.children.length === 0 && <p className="py-5 text-sm text-ink-soft">Không tìm thấy trẻ. Thử từ khóa hoặc trạng thái khác.</p>}
      {bulk && <ClassroomBatchDialog
        title={`Cấp mã cho trẻ lớp ${classroom.className}`}
        action="Cấp mã"
        people={batchPeople}
        description="Chỉ cấp cho trẻ chưa có mã. Mã mới chỉ hiện trong lần này. Hãy in thẻ để gửi riêng cho từng gia đình."
        onClose={() => setBulk(false)}
        onConfirm={async (ids) => {
          const result = await api.issueInitialCodes(classroom.classId, ids);
          const issued = new Map(result.issued.map((item) => [item.childId, item.issuedAt]));
          onChange({ ...classroom, children: classroom.children.map((child) =>
            issued.has(child.childId) ? { ...child, loginCodeIssuedAt: issued.get(child.childId)! } : child,
          ) });
          return result;
        }}
        resultView={(result) => (
          <>
            <BatchOutcome people={batchPeople} completed={`Đã cấp mã cho ${result.issued.length} trẻ`} skipped={result.skipped} />
            {result.issued.length > 0 && <>
              <p className="mt-3 text-sm text-ink-soft">Mã chỉ hiện lần này. In thẻ trước khi đóng.</p>
              <button type="button" className="asset-button-primary mt-2" onClick={() => window.print()}>In {result.issued.length} thẻ đăng nhập</button>
              <LoginCodeCards className={classroom.className} items={result.issued} people={batchPeople} />
              {createPortal(
                <div className="login-code-print-document">
                  <LoginCodeCards className={classroom.className} items={result.issued} people={batchPeople} />
                </div>,
                document.body,
              )}
            </>}
          </>
        )}
      />}
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

function LoginCodeCards({ className, items, people }: {
  className: string;
  items: { childId: string; code: string }[];
  people: { id: string; name: string }[];
}) {
  const names = new Map(people.map((person) => [person.id, person.name]));
  return (
    <ul className="mt-4 grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <li key={item.childId} className="break-inside-avoid rounded-xl border border-line p-3 text-center">
          <p className="text-xs text-ink-soft">LumiKids · Lớp {className}</p>
          <p className="break-words font-semibold">{names.get(item.childId)}</p>
          <p className="my-1 select-all font-mono text-xl font-bold tracking-wider">{item.code}</p>
          <p className="text-xs text-ink-soft">Đăng nhập → Bé vào chơi → Nhập mã</p>
        </li>
      ))}
    </ul>
  );
}
