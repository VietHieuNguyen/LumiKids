"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthFrame } from "@/components/auth-frame";
import { registerGuardian } from "@/lib/auth-api";
import type { GuardianRelationship } from "@/lib/auth-api";

const relationships: [GuardianRelationship, string][] = [
  ["MOTHER", "Mẹ"],
  ["FATHER", "Bố"],
  ["GRANDPARENT", "Ông / bà"],
  ["OTHER", "Người giám hộ khác"],
];

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [relationship, setRelationship] = useState<GuardianRelationship>("MOTHER");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (password.length < 10) return setError("Mật khẩu cần ít nhất 10 kí tự.");
    if (password !== confirm) return setError("Hai lần nhập mật khẩu chưa khớp.");
    setError("");
    setSubmitting(true);
    try {
      const accepted = await registerGuardian({ fullName, email, phone, relationship, password });
      setPassword("");
      setConfirm("");
      router.push(`/verify-email?email=${encodeURIComponent(accepted.email)}&sent=1`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Chưa đăng ký được. Vui lòng thử lại.");
      setSubmitting(false);
    }
  }

  return (
    <AuthFrame
      title="Phụ huynh đăng ký"
      lead="Tạo tài khoản để thêm hồ sơ của con, chọn trò chơi ở nhà và xin cho con vào lớp bằng mã mời của giáo viên."
      artTitle="Cùng con khám phá thung lũng"
      artNote="Bố mẹ chọn trò, con chơi bằng mã riêng, kết quả lưu lại để theo dõi."
    >
      <form className="lg-form" onSubmit={submit} aria-busy={submitting}>
        <div className="lg-field">
          <label htmlFor="reg-name" className="lg-label">Họ và tên</label>
          <input id="reg-name" className="lg-input" required maxLength={120} autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} disabled={submitting} />
        </div>
        <div className="lg-row">
          <div className="lg-field">
            <label htmlFor="reg-relationship" className="lg-label">Quan hệ với trẻ</label>
            <select id="reg-relationship" className="lg-input lg-select" value={relationship} onChange={(event) => setRelationship(event.target.value as GuardianRelationship)} disabled={submitting}>
              {relationships.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div className="lg-field">
            <label htmlFor="reg-phone" className="lg-label">Số điện thoại <span className="font-normal text-ink-soft">(tùy chọn)</span></label>
            <input id="reg-phone" type="tel" className="lg-input" maxLength={20} autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} disabled={submitting} />
          </div>
        </div>
        <div className="lg-field">
          <label htmlFor="reg-email" className="lg-label">Email</label>
          <input id="reg-email" type="email" className="lg-input" required maxLength={254} autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={submitting} aria-describedby="reg-email-hint" />
          <p id="reg-email-hint" className="lg-hint">Mã xác minh gồm 6 chữ số sẽ được gửi tới email này.</p>
        </div>
        <div className="lg-field">
          <label htmlFor="reg-password" className="lg-label">Mật khẩu</label>
          <div className="lg-passwordWrap">
            <input id="reg-password" type={showPassword ? "text" : "password"} className="lg-input lg-inputPassword" required minLength={10} maxLength={128} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={submitting} aria-describedby="reg-password-hint" />
            <button type="button" aria-controls="reg-password" aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"} aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)} className="lg-reveal">{showPassword ? "Ẩn" : "Hiện"}</button>
          </div>
          <p id="reg-password-hint" className="lg-hint">Ít nhất 10 kí tự.</p>
        </div>
        <div className="lg-field">
          <label htmlFor="reg-confirm" className="lg-label">Nhập lại mật khẩu</label>
          <input id="reg-confirm" type={showPassword ? "text" : "password"} className="lg-input" required maxLength={128} autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} disabled={submitting} />
        </div>
        {error && <p role="alert" className="lg-error">{error}</p>}
        <button type="submit" disabled={submitting} className="lg-submit">{submitting ? "Đang tạo tài khoản…" : "Tạo tài khoản"}</button>
      </form>
      <p className="lg-help">Đã có tài khoản? <Link className="lg-link" href="/login">Đăng nhập</Link></p>
    </AuthFrame>
  );
}
