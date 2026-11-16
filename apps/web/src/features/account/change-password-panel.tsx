"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "@/components/auth-provider";
import { changePassword } from "@/lib/auth-api";

/** Own password change. The API ends every session, so the user signs in again with the new one. */
export function ChangePasswordPanel() {
  const { session, invalidateSession } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mismatch = confirm.length > 0 && confirm !== next;
  const tooShort = next.length > 0 && next.length < 10;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || busy || mismatch || tooShort) return;
    setBusy(true);
    setError("");
    try {
      await changePassword(session.accessToken, current, next);
      invalidateSession();
      router.replace("/login?changed=1");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Chưa đổi được mật khẩu.");
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="password-heading" className="mt-8 rounded-3xl border border-line bg-paper p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="password-heading" className="font-display text-xl font-bold">Mật khẩu</h2>
          <p className="text-sm text-ink-soft">Mới nhận mật khẩu tạm từ quản trị? Hãy đổi sang mật khẩu của riêng bạn.</p>
        </div>
        {!open && (
          <button type="button" className="asset-button-secondary" onClick={() => setOpen(true)}>
            Đổi mật khẩu
          </button>
        )}
      </div>
      {open && (
        <form className="mt-5 grid gap-4 sm:max-w-md" onSubmit={submit}>
          <div>
            <label className="asset-label" htmlFor="pw-current">Mật khẩu hiện tại</label>
            <input id="pw-current" type={show ? "text" : "password"} className="asset-input mt-1" autoComplete="current-password" required value={current} onChange={(event) => setCurrent(event.target.value)} />
          </div>
          <div>
            <label className="asset-label" htmlFor="pw-new">Mật khẩu mới</label>
            <input id="pw-new" type={show ? "text" : "password"} className="asset-input mt-1" autoComplete="new-password" required minLength={10} maxLength={128} aria-describedby="pw-new-hint" aria-invalid={tooShort} value={next} onChange={(event) => setNext(event.target.value)} />
            <p id="pw-new-hint" className={`mt-1 text-xs ${tooShort ? "text-berry" : "text-ink-soft"}`}>Ít nhất 10 kí tự. Một câu ngắn dễ nhớ là lựa chọn tốt.</p>
          </div>
          <div>
            <label className="asset-label" htmlFor="pw-confirm">Nhập lại mật khẩu mới</label>
            <input id="pw-confirm" type={show ? "text" : "password"} className="asset-input mt-1" autoComplete="new-password" required aria-invalid={mismatch} aria-describedby={mismatch ? "pw-confirm-error" : undefined} value={confirm} onChange={(event) => setConfirm(event.target.value)} />
            {mismatch && <p id="pw-confirm-error" className="mt-1 text-xs text-berry">Hai mật khẩu chưa giống nhau.</p>}
          </div>
          <label className="flex min-h-10 items-center gap-2 text-sm font-medium">
            <input type="checkbox" className="h-5 w-5 accent-[#2f8a4d]" checked={show} onChange={(event) => setShow(event.target.checked)} />
            Hiện mật khẩu
          </label>
          <p className="rounded-2xl bg-sky p-3 text-sm">Sau khi đổi, bạn sẽ được đăng xuất khỏi mọi thiết bị và đăng nhập lại bằng mật khẩu mới.</p>
          {error && <p role="alert" className="asset-error">{error}</p>}
          <div className="flex gap-2">
            <button className="asset-button-primary" disabled={busy || mismatch || tooShort || !current || !next || !confirm}>
              {busy ? "Đang đổi…" : "Đổi mật khẩu"}
            </button>
            <button type="button" className="asset-button-secondary" disabled={busy} onClick={() => { setOpen(false); setError(""); setCurrent(""); setNext(""); setConfirm(""); }}>
              Hủy
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
