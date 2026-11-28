"use client";
import { useState } from "react";
import type { SupportGrant } from "@lumikids/shared";
import { classroomError } from "../classrooms/api";
import { ErrorBanner, Panel } from "../classrooms/classroom-shell";
import { formatDateTime } from "../classrooms/format";
import { useResource } from "../classrooms/use-resource";
import type { FamilyApi } from "./api";

const choices = [
  { hours: 1, label: "1 giờ" },
  { hours: 24, label: "24 giờ" },
  { hours: 72, label: "72 giờ" },
];

/** Privacy: nothing is shared by default. A guardian opens support for a fixed time and can close it at once. */
export function SupportAccessPanel({ family, childId }: { family: FamilyApi; childId: string }) {
  const grants = useResource<SupportGrant[]>((signal) => family.supportGrants(childId, signal), childId);
  const [hours, setHours] = useState(24);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
      grants.reload();
    } catch (failure) {
      setError(classroomError(failure));
    } finally {
      setBusy(false);
    }
  }

  const running = (grants.data ?? []).filter((grant) => grant.active);
  return (
    <Panel
      title="Hỗ trợ kỹ thuật"
      description="Khi con gặp sự cố ở nhà, bạn có thể cho đội hỗ trợ xem hồ sơ và lượt chơi ở nhà trong thời gian ngắn. Mọi lần xem đều được ghi lại. Bạn có thể thu hồi bất cứ lúc nào."
    >
      {grants.error && <ErrorBanner message={grants.error} onRetry={grants.reload} />}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="asset-label" htmlFor="support-hours">Cho phép trong</label>
          <select id="support-hours" className="asset-input mt-1" value={hours} onChange={(event) => setHours(Number(event.target.value))} disabled={busy}>
            {choices.map((choice) => <option key={choice.hours} value={choice.hours}>{choice.label}</option>)}
          </select>
        </div>
        <button type="button" className="asset-button-primary" disabled={busy} onClick={() => void run(() => family.grantSupport(childId, hours))}>
          {busy ? "Đang lưu…" : "Cho phép hỗ trợ"}
        </button>
      </div>
      {error && <p role="alert" className="asset-error mt-3">{error}</p>}
      {grants.loading && !grants.data && <p role="status" className="mt-4 text-sm text-ink-soft">Đang kiểm tra quyền hỗ trợ…</p>}
      {grants.data && (
        <p role="status" className="mt-4 text-sm text-ink-soft">
          {running.length === 0 ? "Bạn chưa cấp quyền hỗ trợ nào còn hiệu lực." : `Đang cho phép đến ${formatDateTime(running[0]!.expiresAt)}.`}
        </p>
      )}
      {running.length > 0 && (
        <ul className="mt-3 divide-y divide-line">
          {running.map((grant) => (
            <li key={grant.grantId} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <span>Từ {formatDateTime(grant.grantedAt)} đến {formatDateTime(grant.expiresAt)}</span>
              <button type="button" className="asset-text-button !text-berry hover:!text-ink" disabled={busy} onClick={() => void run(() => family.revokeSupport(childId, grant.grantId))}>
                Thu hồi
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
