"use client";

import { Suspense, useEffect, useState } from "react";
import type { FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { LumiLogo, LumiWordmark } from "@/components/lumi-logo";
import { LANDING_ASSETS } from "@/features/landing/landing-assets";
import { AuthError } from "@/lib/auth-api";
import { childLogin } from "@/lib/child-auth-api";
import { formatLoginCodeInput, isCompleteLoginCode } from "@/lib/child-login-code";
import { homeFor } from "@/lib/home-for";
import { safeReturnPath } from "@/lib/safe-return-path";

type Mode = "adult" | "child";

export default function LoginPage() {
  // useSearchParams needs a Suspense boundary on a statically prerendered page.
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  // `?next=` brings the user back to what they picked (e.g. a game from the landing page).
  const next = safeReturnPath(params.get("next"));
  // Children play under /child; a link into it (or ?mode=child) opens the code form directly.
  const [mode, setMode] = useState<Mode>(params.get("mode") === "child" || next?.startsWith("/child") ? "child" : "adult");
  const childDestination = next?.startsWith("/child") ? next : "/child/games";
  const { session, loading, login } = useAuth();
  const destination = next && !next.startsWith("/child") ? next : homeFor(session?.user.permissions ?? []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [code, setCode] = useState("");

  // A teacher already signed in on a classroom tablet must still be able to hand it to a child.
  useEffect(() => { if (mode === "adult" && !loading && session) router.replace(destination); }, [mode, loading, session, router, destination]);

  function switchMode(value: Mode) {
    setMode(value);
    setError("");
  }

  async function handleChildSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (!isCompleteLoginCode(code)) {
      setError("Mã có 8 kí tự. Con kiểm tra lại nhé.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await childLogin(code);
      setCode("");
      router.replace(childDestination);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Đăng nhập chưa được. Con thử lại nhé.");
    } finally { setSubmitting(false); }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || loading) return;
    setError("");
    setSubmitting(true);
    try {
      await login(email, password);
      setPassword("");
      // The effect above redirects once the session (and so the role's home) is known.
    } catch (failure) {
      if (failure instanceof AuthError && failure.code === "ACCOUNT_NOT_VERIFIED") {
        router.push(`/verify-email?email=${encodeURIComponent(email.trim().toLowerCase())}`);
        return;
      }
      setError(failure instanceof Error ? failure.message : "Đăng nhập không thành công. Vui lòng thử lại.");
    } finally { setSubmitting(false); }
  }

  return (
    <main className="lg-page">
      {/* The same valley poster as the landing page: a calm welcome-back picture beside the form. */}
      <aside className="lg-art" aria-hidden="true">
        <div className="lg-posterFrame">
          <Image className="lg-poster" src={LANDING_ASSETS.poster} alt="" fill priority sizes="(max-width: 900px) 100vw, 70vw" />
        </div>
        <div className="lg-artCopy">
          <p className="lg-artTitle">Chào mừng trở lại thung lũng</p>
          <p className="lg-artNote">Các bạn nhỏ đang chờ những trò chơi mới của cô.</p>
        </div>
      </aside>

      <section className="lg-panel" aria-labelledby="login-heading">
        <div className="lg-panelInner">
          <Link className="lg-brand" href="/" aria-label="LumiKids — về trang chủ">
            <LumiLogo />
            <LumiWordmark />
          </Link>

          <h1 id="login-heading" className="lg-title">{mode === "child" ? "Chào bé!" : "Đăng nhập"}</h1>
          <p className="lg-lead">{mode === "child" ? "Nhập mã cô giáo hoặc bố mẹ đưa cho con để vào chơi." : "Thầy cô và phụ huynh đăng nhập bằng email và mật khẩu."}</p>

          <div className="lg-modes" role="group" aria-label="Chọn cách đăng nhập">
            <button type="button" className="lg-mode" aria-pressed={mode === "adult"} onClick={() => switchMode("adult")} disabled={submitting}>Người lớn</button>
            <button type="button" className="lg-mode" aria-pressed={mode === "child"} onClick={() => switchMode("child")} disabled={submitting}>Bé vào chơi</button>
          </div>

          {mode === "child" ? (
            <form className="lg-form" onSubmit={handleChildSubmit} aria-busy={submitting}>
              <div className="lg-field">
                <label htmlFor="child-code" className="lg-label">Mã của con</label>
                <input id="child-code" name="code" className="lg-input lg-codeInput" value={code} onChange={(event) => setCode(formatLoginCodeInput(event.target.value))} placeholder="ABCD-2345" autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false} inputMode="text" maxLength={9} disabled={submitting} aria-describedby="child-code-hint" />
                <p id="child-code-hint" className="lg-hint">Mã có 8 kí tự, chữ in hoa và số.</p>
              </div>
              {error && <p role="alert" className="lg-error">{error}</p>}
              <button type="submit" disabled={submitting} className="lg-submit">{submitting ? "Đang vào…" : "Vào chơi"}</button>
            </form>
          ) : (
          <form className="lg-form" onSubmit={handleSubmit} aria-busy={submitting}>
            {params.get("changed") === "1" && !error && <p role="status" className="lg-notice">Đã đổi mật khẩu. Hãy đăng nhập lại bằng mật khẩu mới.</p>}
            <div className="lg-field">
              <label htmlFor="email" className="lg-label">Email</label>
              <input id="email" name="email" type="email" autoComplete="username" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="teacher1@lumikids.local" className="lg-input" disabled={submitting} />
            </div>
            <div className="lg-field">
              <label htmlFor="password" className="lg-label">Mật khẩu</label>
              <div className="lg-passwordWrap">
                <input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required maxLength={256} value={password} onChange={(event) => setPassword(event.target.value)} className="lg-input lg-inputPassword" disabled={submitting} />
                <button type="button" aria-controls="password" aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"} aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)} className="lg-reveal">{showPassword ? "Ẩn" : "Hiện"}</button>
              </div>
            </div>
            {error && <p role="alert" className="lg-error">{error}</p>}
            <button type="submit" disabled={loading || submitting || Boolean(session)} className="lg-submit">{loading ? "Đang kiểm tra phiên…" : submitting ? "Đang đăng nhập…" : "Đăng nhập"}</button>
          </form>
          )}

          {mode === "child" ? (
            <p className="lg-help">Chưa có mã? Con hỏi cô giáo hoặc bố mẹ nhé.</p>
          ) : (
            <p className="lg-help">Phụ huynh chưa có tài khoản? <Link className="lg-link" href="/register">Đăng ký</Link>. Thầy cô nhận tài khoản từ quản trị viên.</p>
          )}
          <Link className="lg-back" href="/">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8H4m3.5-3.5L4 8l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Về trang chủ
          </Link>
        </div>
      </section>
    </main>
  );
}
