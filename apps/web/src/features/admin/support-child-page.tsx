"use client";
import type { SupportChildView } from "@lumikids/shared";
import { supportChildViewSchema } from "@lumikids/shared";
import { ClassroomShell, ErrorBanner, Notice, Panel, StatusPill } from "../classrooms/classroom-shell";
import { formatDateOnly, formatDateTime, genderLabels } from "../classrooms/format";
import { useClassroomSession } from "../classrooms/use-classroom-session";
import { useResource } from "../classrooms/use-resource";

/**
 * Support staff view of a home child. The server answers only while the guardian's grant runs; every view is
 * recorded in the audit log, so this page is read-only and shows nothing else about the child.
 */
export function AdminSupportChildPage({ childId }: { childId: string }) {
  const { session, loading, api, allowed } = useClassroomSession("MANAGE_CLASSROOMS");
  if (loading || !session || !api) return <Notice>Đang kiểm tra phiên đăng nhập…</Notice>;
  if (!allowed) return <Notice>Bạn chưa có quyền quản lý lớp học.</Notice>;
  return <SupportView key={`${session.user.userId}:${childId}`} childId={childId} load={(signal) => loadView(api, childId, signal)} />;
}

async function loadView(api: NonNullable<ReturnType<typeof useClassroomSession>["api"]>, childId: string, signal: AbortSignal): Promise<SupportChildView> {
  return supportChildViewSchema.parse(await api.raw(`/admin/support/children/${encodeURIComponent(childId)}`, { signal }));
}

function SupportView({ childId, load }: { childId: string; load: (signal: AbortSignal) => Promise<SupportChildView> }) {
  const view = useResource<SupportChildView>(load, childId);
  const back = { href: "/admin/children", label: "Quản lý trẻ" };
  if (view.error)
    return (
      <ClassroomShell title="Hỗ trợ kỹ thuật" back={back}>
        <Panel title="Chưa xem được hồ sơ">
          <ErrorBanner message={view.error} onRetry={view.reload} />
          <p className="mt-3 text-sm text-ink-soft">Hồ sơ ở nhà chỉ mở khi phụ huynh đã cho phép hỗ trợ và thời hạn còn hiệu lực.</p>
        </Panel>
      </ClassroomShell>
    );
  if (!view.data) return <ClassroomShell title="Hỗ trợ kỹ thuật" back={back}><p role="status">Đang tải…</p></ClassroomShell>;
  const data = view.data;
  return (
    <ClassroomShell
      title={data.child.fullName}
      eyebrow="Hỗ trợ kỹ thuật · chỉ đọc"
      back={back}
      actions={<StatusPill tone="amber">Cho phép đến {formatDateTime(data.grant.expiresAt)}</StatusPill>}
    >
      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Panel title="Thông tin">
          <dl className="space-y-3 text-sm">
            <div><dt className="text-ink-soft">Ngày sinh</dt><dd className="font-medium">{formatDateOnly(data.child.dob)}</dd></div>
            <div><dt className="text-ink-soft">Giới tính</dt><dd className="font-medium">{genderLabels[data.child.gender as keyof typeof genderLabels] ?? data.child.gender}</dd></div>
          </dl>
        </Panel>
        <Panel title="Lượt chơi gần đây" description="Gồm cả lượt chơi ở nhà. Tối đa 50 lượt gần nhất.">
          {data.sessions.length === 0 ? (
            <p className="text-sm text-ink-soft">Chưa có lượt chơi nào.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-ink-soft"><tr><th className="py-2 font-medium">Bắt đầu</th><th className="font-medium">Nơi chơi</th><th className="font-medium">Trạng thái</th><th className="text-right font-medium">Số thao tác</th></tr></thead>
              <tbody>
                {data.sessions.map((row) => (
                  <tr key={row.sessionId} className="border-t border-line">
                    <td className="py-2">{formatDateTime(row.startedAt)}</td>
                    <td>{row.context === "HOME" ? "Ở nhà" : "Ở lớp"}</td>
                    <td>{row.status}</td>
                    <td className="text-right tabular-nums">{row.eventCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </ClassroomShell>
  );
}
