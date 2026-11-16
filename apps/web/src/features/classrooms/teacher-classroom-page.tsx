"use client";
import Link from "next/link";
import { useState } from "react";
import type { ClassroomChild } from "@lumikids/shared";
import type { ClassroomApi } from "./api";
import { ClassroomShell, ErrorBanner, Notice, Panel, StatusPill } from "./classroom-shell";
import { ageInYears, childStatusLabels, classroomStatusLabels, formatDateTime, genderLabels, localToday } from "./format";
import { LoginCodeDialog } from "./login-code-dialog";
import { useClassroomSession } from "./use-classroom-session";
import { useResource } from "./use-resource";

export function TeacherClassroomPage({ classId }: { classId: string }) {
  const { session, loading, api, allowed, canIssueCodes } = useClassroomSession("READ_OWN_CLASSROOMS");
  if (loading || !session || !api) return <Notice>Đang kiểm tra phiên đăng nhập…</Notice>;
  if (!allowed) return <Notice>Tài khoản này không phụ trách lớp học.</Notice>;
  return <TeacherClassroom key={`${session.user.userId}:${classId}`} api={api} classId={classId} canIssueCodes={canIssueCodes} />;
}

function TeacherClassroom({ api, classId, canIssueCodes }: { api: ClassroomApi; classId: string; canIssueCodes: boolean }) {
  const classroom = useResource((signal) => api.myClassroom(classId, signal), classId);
  const [issuing, setIssuing] = useState<ClassroomChild | null>(null);
  const back = { href: "/teacher/classrooms", label: "Lớp của tôi" };
  if (!classroom.data)
    return (
      <ClassroomShell title="Lớp học" back={back}>
        {classroom.error ? <ErrorBanner message={classroom.error} onRetry={classroom.reload} /> : <p role="status">Đang tải lớp…</p>}
      </ClassroomShell>
    );
  const data = classroom.data;
  const active = data.status === "ACTIVE";
  const today = localToday();
  const withoutCode = data.children.filter((child) => !child.loginCodeIssuedAt).length;
  return (
    <ClassroomShell
      title={data.className}
      eyebrow={`${data.ageGroup.name} · Năm học ${data.schoolYear.name}`}
      back={back}
      actions={!active ? <StatusPill tone="slate">{classroomStatusLabels.ARCHIVED}</StatusPill> : undefined}
    >
      {classroom.error && <ErrorBanner message={classroom.error} onRetry={classroom.reload} />}
      <Panel
        title={`Danh sách lớp (${data.children.length} trẻ)`}
        description={
          data.teachers.length
            ? `Giáo viên: ${data.teachers.map((teacher) => teacher.fullName).join(", ")}`
            : undefined
        }
        actions={withoutCode > 0 && active ? <StatusPill tone="amber">{withoutCode} trẻ chưa có mã</StatusPill> : undefined}
      >
        {data.children.length === 0 ? (
          <p className="text-sm text-slate-600">Lớp chưa có trẻ đang học.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.children.map((child) => {
              const age = ageInYears(child.dob, today);
              return (
                <li key={child.childId} className="flex flex-wrap items-center gap-3 py-3">
                  <Link className="min-w-0 flex-1 rounded-lg hover:bg-slate-50" href={`/teacher/classrooms/${classId}/children/${child.childId}`}>
                    <span className="block break-words font-semibold text-blue-700">{child.fullName}</span>
                    <span className="block text-sm text-slate-600">
                      {age === null ? "" : `${age} tuổi · `}
                      {genderLabels[child.gender]} ·{" "}
                      {child.loginCodeIssuedAt ? `Mã cấp ${formatDateTime(child.loginCodeIssuedAt)}` : "Chưa có mã"}
                    </span>
                  </Link>
                  {child.status === "DISABLED" && <StatusPill tone="red">{childStatusLabels.DISABLED}</StatusPill>}
                  {canIssueCodes && active && child.status === "ACTIVE" && (
                    <button type="button" className="asset-button-secondary" onClick={() => setIssuing(child)}>
                      {child.loginCodeIssuedAt ? "Cấp mã mới" : "Cấp mã"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      {issuing && (
        <LoginCodeDialog
          api={api}
          classId={classId}
          className={data.className}
          child={issuing}
          onClose={() => setIssuing(null)}
          onIssued={(issued) =>
            classroom.replace({
              ...data,
              children: data.children.map((child) => (child.childId === issued.childId ? { ...child, loginCodeIssuedAt: issued.issuedAt } : child)),
            })
          }
        />
      )}
    </ClassroomShell>
  );
}
