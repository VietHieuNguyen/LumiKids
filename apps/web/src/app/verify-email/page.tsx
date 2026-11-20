"use client";

import { Suspense, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthFrame } from "@/components/auth-frame";
import { resendVerification, verifyEmail } from "@/lib/auth-api";

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyForm />
    </Suspense>
  );
}

function VerifyForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(params.get("sent") === "1" ? "Đã gửi mã xác minh. Mã có hiệu lực trong 15 phút." : "");
  const [verified, setVerified] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (!/^\d{6}$/.test(code)) return setError("Mã xác minh gồm đúng 6 chữ số.");
    setError("");
    setNotice("");
    setSubmitting(true);
    try {
      await verifyEmail(email, code);
      setVerified(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Chưa xác minh được. Vui lòng thử lại.");
    } finally {
      setSubmitting(false);
    }
  }

  async function resend() {
    if (resending || !email.trim()) return;
    setResending(true);
    setError("");
    try {
      const accepted = await resendVerification(email);
      setNotice(`Nếu email này đang chờ xác minh, mã mới đã được gửi (hiệu lực ${accepted.expiresInMinutes} phút).`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Chưa gửi lại được mã.");
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthFrame
      title={verified ? "Đã xác minh!" : "Xác minh email"}
      lead={verified ? "Tài khoản đã sẵn sàng. Hãy đăng nhập để thêm hồ sơ của con." : "Nhập mã 6 chữ số đã gửi tới email đăng ký."}
      artTitle="Sắp xong rồi"
      artNote="Một bước nữa để cùng con vào thung lũng LumiKids."
    >
      {verified ? (
        <div className="lg-form">
          <p role="status" className="lg-notice">Email {email} đã được xác minh.</p>
          <button type="button" className="lg-submit" onClick={() => router.push("/login")}>Đăng nhập</button>
        </div>
      ) : (
        <>
          <form className="lg-form" onSubmit={submit} aria-busy={submitting}>
            {notice && !error && <p role="status" className="lg-notice">{notice}</p>}
            <div className="lg-field">
              <label htmlFor="verify-email" className="lg-label">Email</label>
              <input id="verify-email" type="email" className="lg-input" required maxLength={254} autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={submitting} />
            </div>
            <div className="lg-field">
              <label htmlFor="verify-code" className="lg-label">Mã xác minh</label>
              <input id="verify-code" className="lg-input lg-codeInput" required inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} disabled={submitting} />
            </div>
            {error && <p role="alert" className="lg-error">{error}</p>}
            <button type="submit" disabled={submitting} className="lg-submit">{submitting ? "Đang xác minh…" : "Xác minh"}</button>
          </form>
          <p className="lg-help">
            Chưa nhận được mã?{" "}
            <button type="button" className="lg-textButton" onClick={() => void resend()} disabled={resending || !email.trim()}>{resending ? "Đang gửi…" : "Gửi lại mã"}</button>
            {" · "}
            <Link className="lg-link" href="/register">Đăng ký lại</Link>
          </p>
        </>
      )}
    </AuthFrame>
  );
}
