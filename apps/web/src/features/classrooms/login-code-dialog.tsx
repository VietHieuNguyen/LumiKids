"use client";
import { useState } from "react";
import type { IssuedLoginCode } from "@lumikids/shared";
import { classroomError } from "./api";
import type { ClassroomApi } from "./api";
import { Dialog } from "./classroom-shell";
import { formatDateTime } from "./format";

/**
 * Issue a new login code: confirm (the old code stops working and the child is signed out everywhere),
 * then show the code once, large enough to read out, with a printable card. Closing forgets it.
 */
export function LoginCodeDialog({
  api,
  classId,
  className,
  issue: issueWith,
  child,
  onClose,
  onIssued,
}: {
  api?: ClassroomApi;
  classId?: string;
  /** Empty for a child the family manages (no class). */
  className: string;
  /** Issues the code another way (the guardian's family route); defaults to the teacher route. */
  issue?: () => Promise<IssuedLoginCode>;
  child: { childId: string; fullName: string; loginCodeIssuedAt: string | null };
  onClose: () => void;
  onIssued: (issued: IssuedLoginCode) => void;
}) {
  const [issued, setIssued] = useState<IssuedLoginCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function issue() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const run = issueWith ?? (api && classId ? () => api.issueLoginCode(classId, child.childId) : null);
      if (!run) throw new Error("Không có cách cấp mã cho trẻ này.");
      const result = await run();
      setIssued(result);
      onIssued(result);
    } catch (failure) {
      setError(classroomError(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title={issued ? `Mã đăng nhập của ${child.fullName}` : `Cấp mã mới cho ${child.fullName}`} onClose={onClose}>
      {issued ? (
        <div>
          <div className="print-card rounded-2xl border-2 border-dashed border-leaf/40 bg-leaf-soft p-5 text-center">
            <p className="text-sm font-medium text-leaf">LumiKids · {className ? `Lớp ${className}` : "Ở nhà"}</p>
            <p className="mt-1 break-words text-lg font-bold text-ink">{child.fullName}</p>
            <p className="mt-4 select-all font-mono text-4xl font-bold tracking-[0.18em] text-ink" aria-label={`Mã ${issued.code.split("").join(" ")}`}>
              {issued.code}
            </p>
            <p className="mt-4 text-xs text-ink-soft">Vào trang Đăng nhập → “Bé vào chơi” → nhập mã.</p>
          </div>
          <p className="mt-4 text-sm leading-6 text-[#8a5a00]">
            Mã chỉ hiện một lần. Hãy đọc cho bé, ghi lại hoặc in thẻ trước khi đóng. Nếu quên, cấp mã mới.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="asset-button-secondary" onClick={() => window.print()}>In thẻ</button>
            <button type="button" className="asset-button-primary" onClick={onClose}>Xong</button>
          </div>
        </div>
      ) : (
        <div>
          <p className="text-sm leading-6 text-ink">
            {child.loginCodeIssuedAt
              ? `Bé đang có mã cấp lúc ${formatDateTime(child.loginCodeIssuedAt)}. Mã cũ sẽ hết hiệu lực và bé bị đăng xuất khỏi mọi máy.`
              : "Bé chưa có mã. Sau khi cấp, bé dùng mã này để vào chơi."}
          </p>
          {error && <p role="alert" className="asset-error mt-3">{error}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="asset-button-secondary" onClick={onClose} disabled={busy}>Hủy</button>
            <button type="button" className="asset-button-primary" onClick={() => void issue()} disabled={busy}>
              {busy ? "Đang cấp…" : child.loginCodeIssuedAt ? "Cấp mã mới" : "Cấp mã"}
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
