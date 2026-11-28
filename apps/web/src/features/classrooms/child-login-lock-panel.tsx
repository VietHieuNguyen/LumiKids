"use client";
import { useState } from "react";
import type { FormEvent } from "react";
import { ClassroomApi, classroomError } from "./api";
import { ErrorBanner, Panel, StatusPill } from "./classroom-shell";
import { formatDateTime } from "./format";
import { useResource } from "./use-resource";

/** Admin: lock a child's sign-in while the child is in a class. The reason is required and kept. */
export function AdminLoginLockPanel({ api, childId }: { api: ClassroomApi; childId: string }) {
  const state = useResource((signal) => api.childLoginLock(childId, signal), childId);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const locked = state.data?.loginLocked ?? false;

  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
      setReason("");
      state.reload();
    } catch (failure) {
      setError(classroomError(failure));
    } finally {
      setBusy(false);
    }
  }
  function lock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(() => api.lockChildLogin(childId, reason.trim()));
  }

  return (
    <Panel
      title="Khóa đăng nhập"
      description="Chỉ khóa việc đăng nhập bằng mã. Hồ sơ và dữ liệu của trẻ vẫn giữ nguyên. Giáo viên lớp sẽ thấy lý do khóa."
    >
      {state.error && <ErrorBanner message={state.error} onRetry={state.reload} />}
      {state.data && locked && (
        <div className="space-y-3">
          <StatusPill tone="red">Đang khóa đăng nhập</StatusPill>
          <p className="text-sm text-ink">Lý do: {state.data.reason}</p>
          <p className="text-sm text-ink-soft">Khóa từ {state.data.lockedAt ? formatDateTime(state.data.lockedAt) : "—"}</p>
          <button type="button" className="asset-button-secondary" disabled={busy} onClick={() => void run(() => api.unlockChildLogin(childId))}>
            {busy ? "Đang mở khóa…" : "Mở khóa đăng nhập"}
          </button>
        </div>
      )}
      {state.data && !locked && (
        <form className="space-y-3" onSubmit={lock}>
          <div>
            <label className="asset-label" htmlFor="login-lock-reason">Lý do khóa</label>
            <textarea id="login-lock-reason" className="asset-input mt-1 w-full" rows={2} minLength={3} maxLength={500} required value={reason} onChange={(event) => setReason(event.target.value)} disabled={busy} placeholder="Ví dụ: nghi ngờ mã đã bị lộ" />
          </div>
          <button type="submit" className="asset-button-primary" disabled={busy || reason.trim().length < 3}>
            {busy ? "Đang khóa…" : "Khóa đăng nhập"}
          </button>
        </form>
      )}
      {error && <p role="alert" className="asset-error mt-3">{error}</p>}
    </Panel>
  );
}

/** Teacher: the children of this class whose sign-in is locked, with the reason. */
export function ClassLoginLockPanel({ api, classId }: { api: ClassroomApi; classId: string }) {
  const locks = useResource((signal) => api.classLoginLocks(classId, signal), classId);
  if (locks.error) return <Panel title="Trẻ đang bị khóa đăng nhập"><ErrorBanner message={locks.error} onRetry={locks.reload} /></Panel>;
  if (!locks.data || locks.data.length === 0) return null;
  return (
    <Panel title="Trẻ đang bị khóa đăng nhập" description="Quản trị viên đã khóa đăng nhập của các trẻ dưới đây. Hãy liên hệ quản trị viên nếu cần mở khóa.">
      <ul className="divide-y divide-line">
        {locks.data.map((lock) => (
          <li key={lock.lockId} className="py-3 text-sm">
            <p className="font-medium text-ink">{lock.childName}</p>
            <p className="text-ink-soft">Lý do: {lock.reason}</p>
            <p className="text-ink-soft">Bởi {lock.lockedByName} · {formatDateTime(lock.lockedAt)}</p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
