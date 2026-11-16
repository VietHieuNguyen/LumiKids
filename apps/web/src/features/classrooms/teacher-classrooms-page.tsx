"use client";
import Link from "next/link";
import type { ClassroomApi } from "./api";
import { ClassroomShell, ErrorBanner, Notice, StatusPill } from "./classroom-shell";
import { classroomStatusLabels } from "./format";
import { useClassroomSession } from "./use-classroom-session";
import { useResource } from "./use-resource";

export function TeacherClassroomsPage() {
  const { session, loading, api, allowed } = useClassroomSession("READ_OWN_CLASSROOMS");
  if (loading || !session || !api) return <Notice>Đang kiểm tra phiên đăng nhập…</Notice>;
  if (!allowed) return <Notice>Tài khoản này không phụ trách lớp học.</Notice>;
  return <TeacherClassrooms key={session.user.userId} api={api} />;
}

function TeacherClassrooms({ api }: { api: ClassroomApi }) {
  const classrooms = useResource((signal) => api.myClassrooms(signal), "mine");
  // Current classes first; archived ones stay reachable for looking back at a past year.
  const sorted = [...(classrooms.data ?? [])].sort((a, b) => Number(a.status === "ARCHIVED") - Number(b.status === "ARCHIVED"));
  return (
    <ClassroomShell title="Lớp của tôi" eyebrow="Giáo viên">
      {classrooms.error && <ErrorBanner message={classrooms.error} onRetry={classrooms.reload} />}
      {classrooms.loading && !classrooms.data && <p role="status">Đang tải lớp…</p>}
      {classrooms.data?.length === 0 && (
        <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600">
          Bạn chưa được phân công lớp nào. Nhờ quản trị viên thêm bạn vào lớp.
        </p>
      )}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((item) => (
          <li key={item.classId}>
            <Link
              href={`/teacher/classrooms/${item.classId}`}
              className="flex h-full flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-blue-300"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="break-words text-lg font-bold">{item.className}</span>
                {item.status === "ARCHIVED" && <StatusPill tone="slate">{classroomStatusLabels.ARCHIVED}</StatusPill>}
              </div>
              <span className="text-sm text-slate-600">
                {item.ageGroup.name} · Năm học {item.schoolYear.name}
              </span>
              <span className="mt-auto text-sm font-medium text-slate-800">{item.childCount} trẻ đang học</span>
            </Link>
          </li>
        ))}
      </ul>
    </ClassroomShell>
  );
}
