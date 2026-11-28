"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
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
  const router = useRouter();
  const grants = useResource<ActiveSupportGrant[]>(load, "support");
  const [childId, setChildId] = useState("");
  const trimmed = childId.trim();
  const valid = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(trimmed);

  function openProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (valid) router.push(`/admin/support/${encodeURIComponent(trimmed)}`);
  }
  return (
    <ClassroomShell title="Hỗ trợ kỹ thuật" eyebrow="Chỉ đọc · mọi lần xem được ghi lại">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel title="Đang được phép hỗ trợ" description="Phụ huynh đã cho phép đội hỗ trợ xem hồ sơ ở nhà của các trẻ dưới đây đến thời điểm ghi trong bảng.">
          {grants.error && <ErrorBanner message={grants.error} onRetry={grants.reload} />}
          {grants.loading && !grants.data && <p role="status" className="text-sm text-ink-soft">Đang tải danh sách hỗ trợ…</p>}
          {grants.data && grants.data.length === 0 && <p className="text-sm text-ink-soft">Hiện không có trẻ nào đang được phép hỗ trợ.</p>}
          {grants.data && grants.data.length > 0 && (
            <div className="max-w-full overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-ink-soft"><tr><th scope="col" className="px-2 py-2 font-medium">Trẻ</th><th scope="col" className="px-2 font-medium">Cho phép đến</th><th scope="col"><span className="sr-only">Hồ sơ</span></th></tr></thead>
                <tbody>
                  {grants.data.map((grant) => (
                    <tr key={grant.grantId} className="border-t border-line">
                      <td className="px-2 py-2 font-medium [overflow-wrap:anywhere]">{grant.childName}</td>
                      <td className="px-2">{formatDateTime(grant.expiresAt)}</td>
                      <td className="text-right"><Link className="asset-text-button" href={`/admin/support/${grant.childId}`}>Xem hồ sơ</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <Panel title="Mở hồ sơ theo mã">
          <form onSubmit={openProfile}>
            <label className="asset-label" htmlFor="support-child-id">Mã hồ sơ trẻ (UUID)</label>
            <input id="support-child-id" className="asset-input mt-1 w-full" value={childId} onChange={(event) => setChildId(event.target.value)} aria-describedby="support-id-hint" autoComplete="off" spellCheck={false} />
            <p id="support-id-hint" className="mt-2 text-xs text-ink-soft">
              {trimmed && !valid ? "Nhập mã đầy đủ gồm 36 ký tự, kể cả dấu gạch ngang." : "Hồ sơ chỉ mở khi phụ huynh đang cho phép hỗ trợ."}
            </p>
            <button className="asset-button-primary mt-4" disabled={!valid}>Mở hồ sơ</button>
          </form>
        </Panel>
      </div>
    </ClassroomShell>
  );
}
