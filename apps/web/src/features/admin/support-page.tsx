"use client";
import Link from "next/link";
import { useState } from "react";
import { activeSupportGrantListSchema, type ActiveSupportGrant } from "@lumikids/shared";
import { ClassroomShell, ErrorBanner, Notice, Panel } from "../classrooms/classroom-shell";
import { formatDateTime } from "../classrooms/format";
import { useClassroomSession } from "../classrooms/use-classroom-session";
import { useResource } from "../classrooms/use-resource";

/** Support staff: the children whose guardians have opened support right now. Opening one is audited. */
export function AdminSupportPage() {
  const { loading, api, allowed } = useClassroomSession("MANAGE_CLASSROOMS");
  if (loading || !api) return <Notice>Đang kiểm tra phiên đăng nhập…</Notice>;
  if (!allowed) return <Notice>Bạn chưa có quyền quản lý lớp học.</Notice>;
  return <SupportList load={async (signal) => activeSupportGrantListSchema.parse(await api.raw("/admin/support/grants", { signal }))} />;
}

function SupportList({ load }: { load: (signal: AbortSignal) => Promise<ActiveSupportGrant[]> }) {
  const grants = useResource<ActiveSupportGrant[]>(load, "support");
  const [childId, setChildId] = useState("");
  const trimmed = childId.trim();
  return (
    <ClassroomShell title="Hỗ trợ kỹ thuật" eyebrow="Chỉ đọc · mọi lần xem được ghi lại">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel title="Đang được phép hỗ trợ" description="Phụ huynh đã cho phép đội hỗ trợ xem hồ sơ ở nhà của các trẻ dưới đây đến thời điểm ghi trong bảng.">
          {grants.error && <ErrorBanner message={grants.error} onRetry={grants.reload} />}
          {grants.data && grants.data.length === 0 && <p className="text-sm text-ink-soft">Hiện không có trẻ nào đang được phép hỗ trợ.</p>}
          {grants.data && grants.data.length > 0 && (
            <table className="w-full text-left text-sm">
              <thead className="text-ink-soft"><tr><th className="py-2 font-medium">Trẻ</th><th className="font-medium">Cho phép đến</th><th /></tr></thead>
              <tbody>
                {grants.data.map((grant) => (
                  <tr key={grant.grantId} className="border-t border-line">
                    <td className="py-2 font-medium">{grant.childName}</td>
                    <td>{formatDateTime(grant.expiresAt)}</td>
                    <td className="text-right"><Link className="asset-text-button" href={`/admin/support/${grant.childId}`}>Xem hồ sơ</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
        <Panel title="Mở hồ sơ theo mã">
          <label className="asset-label" htmlFor="support-child-id">Mã hồ sơ trẻ (UUID)</label>
          <input id="support-child-id" className="asset-input mt-1 w-full" value={childId} onChange={(event) => setChildId(event.target.value)} placeholder="xxxxxxxx-xxxx-…" />
          <p className="mt-2 text-xs text-ink-soft">Hồ sơ chỉ mở khi phụ huynh đang cho phép hỗ trợ.</p>
          {trimmed && <Link className="asset-button-primary mt-4 inline-block" href={`/admin/support/${encodeURIComponent(trimmed)}`}>Mở hồ sơ</Link>}
        </Panel>
      </div>
    </ClassroomShell>
  );
}
