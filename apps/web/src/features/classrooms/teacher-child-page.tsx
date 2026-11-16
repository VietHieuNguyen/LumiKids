"use client";
import { useState } from "react";
import type { ClassroomChildDetail } from "@lumikids/shared";
import type { ClassroomApi } from "./api";
import { ClassroomShell, ErrorBanner, Notice, Panel, StatusPill } from "./classroom-shell";
import { gameTypeLabels } from "../game-library/library-page";
import {
  ageInYears,
  childStatusLabels,
  formatDate,
  formatDateOnly,
  formatDateTime,
  formatDuration,
  genderLabels,
  localToday,
  playStatusLabels,
} from "./format";
import { LoginCodeDialog } from "./login-code-dialog";
import { useClassroomSession } from "./use-classroom-session";
import { useResource } from "./use-resource";

export function TeacherChildPage({ classId, childId }: { classId: string; childId: string }) {
  const { session, loading, api, allowed, canIssueCodes } = useClassroomSession("READ_OWN_CLASSROOMS");
  if (loading || !session || !api) return <Notice>Đang kiểm tra phiên đăng nhập…</Notice>;
  if (!allowed) return <Notice>Tài khoản này không phụ trách lớp học.</Notice>;
  return <TeacherChild key={`${session.user.userId}:${classId}:${childId}`} api={api} classId={classId} childId={childId} canIssueCodes={canIssueCodes} />;
}

const playTones = { COMPLETED: "green", ABANDONED: "slate", IN_PROGRESS: "blue" } as const;

function TeacherChild({ api, classId, childId, canIssueCodes }: { api: ClassroomApi; classId: string; childId: string; canIssueCodes: boolean }) {
  const classroom = useResource((signal) => api.myClassroom(classId, signal), classId);
  const child = useResource((signal) => api.child(classId, childId, signal), childId);
  const [page, setPage] = useState(1);
  const history = useResource((signal) => api.playHistory(classId, childId, page, signal), `${childId}:${page}`);
  const [issuing, setIssuing] = useState(false);
  const back = { href: `/teacher/classrooms/${classId}`, label: classroom.data ? `Lớp ${classroom.data.className}` : "Lớp học" };
  if (!child.data)
    return (
      <ClassroomShell title="Hồ sơ trẻ" back={back}>
        {child.error ? <ErrorBanner message={child.error} onRetry={child.reload} /> : <p role="status">Đang tải…</p>}
      </ClassroomShell>
    );
  const profile: ClassroomChildDetail = child.data;
  const age = ageInYears(profile.dob, localToday());
  const canIssue = canIssueCodes && profile.currentlyEnrolled && profile.status === "ACTIVE" && classroom.data?.status === "ACTIVE";
  return (
    <ClassroomShell
      title={profile.fullName}
      eyebrow={classroom.data ? `Lớp ${classroom.data.className}` : undefined}
      back={back}
      actions={
        <>
          {profile.status === "DISABLED" && <StatusPill tone="red">{childStatusLabels.DISABLED}</StatusPill>}
          {!profile.currentlyEnrolled && <StatusPill tone="slate">Đã chuyển lớp</StatusPill>}
          {canIssue && (
            <button type="button" className="asset-button-primary" onClick={() => setIssuing(true)}>
              {profile.loginCodeIssuedAt ? "Cấp mã mới" : "Cấp mã đăng nhập"}
            </button>
          )}
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-6">
          <Panel title="Thông tin">
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-slate-500">Ngày sinh</dt>
                <dd className="font-medium">
                  {formatDateOnly(profile.dob)}
                  {age === null ? "" : ` (${age} tuổi)`}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Giới tính</dt>
                <dd className="font-medium">{genderLabels[profile.gender]}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Mã đăng nhập</dt>
                <dd className="font-medium">{profile.loginCodeIssuedAt ? `Cấp lúc ${formatDateTime(profile.loginCodeIssuedAt)}` : "Chưa có mã"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Thời gian học lớp này</dt>
                <dd>
                  <ul className="font-medium">
                    {profile.periods.map((period) => (
                      <li key={period.startedAt}>
                        {formatDate(period.startedAt)} – {period.endedAt ? formatDate(period.endedAt) : "nay"}
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            </dl>
          </Panel>
        </aside>
        <Panel title="Lịch sử chơi" description="Chỉ gồm các lượt chơi trong thời gian trẻ học lớp này. Đánh giá chỉ số sẽ có ở giai đoạn sau.">
          {history.error && <ErrorBanner message={history.error} onRetry={history.reload} />}
          {history.loading && !history.data && <p role="status" className="text-sm">Đang tải lịch sử…</p>}
          {history.data && history.data.pagination.total === 0 && <p className="text-sm text-slate-600">Trẻ chưa chơi trò nào trong thời gian học lớp này.</p>}
          {history.data && history.data.items.length > 0 && (
            <div className="-mx-4 overflow-x-auto sm:mx-0" aria-busy={history.loading}>
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-medium sm:px-2">Trò chơi</th>
                    <th className="px-2 py-2 font-medium">Bắt đầu</th>
                    <th className="px-2 py-2 font-medium">Thời lượng</th>
                    <th className="px-2 py-2 text-right font-medium">Số lần chọn</th>
                    <th className="px-2 py-2 font-medium">Kết quả</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {history.data.items.map((item) => (
                    <tr key={item.sessionId}>
                      <td className="px-4 py-3 sm:px-2">
                        <span className="block break-words font-medium">{item.gameName}</span>
                        <span className="text-xs text-slate-500">{gameTypeLabels[item.gameType]}</span>
                      </td>
                      <td className="whitespace-nowrap px-2 py-3 tabular-nums">{formatDateTime(item.startedAt)}</td>
                      <td className="whitespace-nowrap px-2 py-3">{formatDuration(item.startedAt, item.endedAt) ?? "—"}</td>
                      <td className="px-2 py-3 text-right tabular-nums">{item.attemptCount}</td>
                      <td className="px-2 py-3">
                        <StatusPill tone={playTones[item.status]}>{playStatusLabels[item.status]}</StatusPill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {history.data && history.data.pagination.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between gap-3 text-sm">
              <button type="button" className="asset-button-secondary" disabled={page <= 1 || history.loading} onClick={() => setPage((n) => n - 1)}>← Mới hơn</button>
              <span className="tabular-nums text-slate-600">Trang {page}/{history.data.pagination.totalPages}</span>
              <button type="button" className="asset-button-secondary" disabled={page >= history.data.pagination.totalPages || history.loading} onClick={() => setPage((n) => n + 1)}>Cũ hơn →</button>
            </div>
          )}
        </Panel>
      </div>
      {issuing && classroom.data && (
        <LoginCodeDialog
          api={api}
          classId={classId}
          className={classroom.data.className}
          child={profile}
          onClose={() => setIssuing(false)}
          onIssued={(issued) => child.replace({ ...profile, loginCodeIssuedAt: issued.issuedAt })}
        />
      )}
    </ClassroomShell>
  );
}
