"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";

export default function LoginPage() {
  const router = useRouter();
  const { session, loading, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { if (!loading && session) router.replace("/account"); }, [loading, session, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || loading) return;
    setError("");
    setSubmitting(true);
    try {
      await login(email, password);
      setPassword("");
      router.replace("/account");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Đăng nhập không thành công. Vui lòng thử lại.");
    } finally { setSubmitting(false); }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-12">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="login-heading">
        <p className="mb-8 text-xl font-bold tracking-tight text-blue-700">LumiKids</p>
        <h1 id="login-heading" className="text-2xl font-semibold text-slate-900">Đăng nhập</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Sử dụng tài khoản đã được cấp để truy cập hệ thống.</p>
        <form className="mt-7 space-y-5" onSubmit={handleSubmit} aria-busy={submitting}>
          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-700">Email</label>
            <input id="email" name="email" type="email" autoComplete="username" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="teacher1@lumikids.local" className="auth-input" disabled={submitting} />
          </div>
          <div>
            <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-700">Mật khẩu</label>
            <div className="relative">
              <input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required maxLength={256} value={password} onChange={(event) => setPassword(event.target.value)} className="auth-input pr-16" disabled={submitting} />
              <button type="button" aria-controls="password" aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"} aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)} className="absolute inset-y-0 right-0 min-w-14 rounded-r-lg px-3 text-sm font-medium text-blue-700 focus-visible:outline-2 focus-visible:outline-blue-600">{showPassword ? "Ẩn" : "Hiện"}</button>
            </div>
          </div>
          {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-700">{error}</p>}
          <button type="submit" disabled={loading || submitting || Boolean(session)} className="min-h-11 w-full rounded-lg bg-blue-700 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-wait disabled:opacity-60">{loading ? "Đang kiểm tra phiên…" : submitting ? "Đang đăng nhập…" : "Đăng nhập"}</button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-500">Chưa có tài khoản? Vui lòng liên hệ quản trị viên.</p>
      </section>
    </main>
  );
}
