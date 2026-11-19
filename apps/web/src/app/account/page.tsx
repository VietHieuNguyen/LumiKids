"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { StaffPage } from "@/components/staff-shell";
import { Notice } from "@/features/classrooms/classroom-shell";
import { ChangePasswordPanel } from "@/features/account/change-password-panel";

const roleLabels: Record<string, string> = {
  ROLE_ADMIN: "Quản trị viên",
  ROLE_TEACHER: "Giáo viên",
  ROLE_GUARDIAN: "Người giám hộ",
};

export default function AccountPage() {
  const { session, loading, logout } = useAuth();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && !session) router.replace("/login");
  }, [loading, session, router]);

  async function handleLogout() {
    setError("");
    setSubmitting(true);
    try {
      await logout();
      router.replace("/login");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Đăng xuất không thành công.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !session)
    return (
      <Notice>Đang kiểm tra phiên đăng nhập…</Notice>
    );

  const user = session.user;
  const has = (permission: string) => user.permissions.includes(permission);
  const admin = has("MANAGE_ALL_GAMES");
  const shortcuts = [
    has("READ_OWN_CLASSROOMS") && { href: "/teacher/classrooms", title: "Lớp của tôi", text: "Giao bài, xem trẻ chơi gì, cấp mã đăng nhập.", tone: "bg-leaf-soft" },
    has("MANAGE_CLASSROOMS") && { href: "/admin", title: "Tổng quan trường", text: "Việc cần xử lý, trẻ chơi thế nào, lớp nào cần để ý.", tone: "bg-sun-soft" },
    has("MANAGE_CLASSROOMS") && { href: "/admin/classrooms", title: "Quản lý lớp học", text: "Năm học, lớp, phân công giáo viên và hồ sơ trẻ.", tone: "bg-leaf-soft" },
    has("MANAGE_USERS") && { href: "/admin/teachers", title: "Tài khoản giáo viên", text: "Thêm, khóa, đặt lại mật khẩu cho giáo viên.", tone: "bg-sky" },
    has("READ_GAMES") && { href: admin ? "/admin/games" : "/teacher/games", title: "Kho trò chơi", text: "Trò chơi đã duyệt, dùng chung cho mọi lớp.", tone: "bg-sky" },
    has("GENERATE_GAME_CONTENT") && { href: admin ? "/admin/games/create" : "/teacher/games/create", title: "Tạo trò chơi bằng AI", text: "Mô tả trò chơi, xem thử rồi lưu vào kho.", tone: "bg-sun-soft" },
    has("MANAGE_GAME_ASSETS") && has("READ_GAME_ASSETS") && { href: "/admin/game-assets", title: "Thư viện hình ảnh", text: "Học liệu và metadata cho trò chơi.", tone: "bg-sky" },
    has("READ_GAME_ASSETS") && { href: "/admin/game-preview", title: "Xem thử trò chơi", text: "Chạy thử GameContent với ảnh thật.", tone: "bg-sun-soft" },
  ].filter(Boolean) as { href: string; title: string; text: string; tone: string }[];

  return (
    <StaffPage>
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-leaf">
          {user.roles.map((role) => roleLabels[role] ?? role).join(", ") || "Chưa được cấp vai trò"}
        </p>
        <h1 id="account-heading" className="font-display text-4xl font-extrabold leading-tight">
          Xin chào, {user.fullName}
        </h1>
        <p className="mt-1 break-words text-sm text-ink-soft">{user.email}</p>

        {shortcuts.length > 0 && (
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shortcuts.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="group flex h-full flex-col rounded-3xl border border-line bg-paper p-5 transition hover:-translate-y-0.5 hover:border-leaf/50 hover:shadow-[0_16px_32px_-20px_rgb(24_56_41/40%)]">
                  <span aria-hidden="true" className={`mb-4 grid h-12 w-12 place-items-center rounded-2xl ${item.tone}`}>
                    <svg width="22" height="22" viewBox="0 0 22 22"><path d="M5 11h12m-4.5-4.5L17 11l-4.5 4.5" fill="none" stroke="#183829" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </span>
                  <span className="font-display text-xl font-bold group-hover:text-leaf">{item.title}</span>
                  <span className="mt-1 text-sm leading-6 text-ink-soft">{item.text}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <ChangePasswordPanel />

        {error && (
          <p role="alert" className="asset-error mt-6">
            {error}
          </p>
        )}
        <button type="button" onClick={handleLogout} disabled={submitting} className="asset-button-secondary mt-8">
          {submitting ? "Đang đăng xuất…" : "Đăng xuất"}
        </button>
      </main>
    </StaffPage>
  );
}
