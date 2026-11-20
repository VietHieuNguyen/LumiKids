"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { StaffPage } from "@/components/staff-shell";
import { Notice } from "@/features/classrooms/classroom-shell";
import { ChangePasswordPanel } from "@/features/account/change-password-panel";
import { ProfileSections } from "@/features/account/profile-sections";
import { useClassroomSession } from "@/features/classrooms/use-classroom-session";

const roleLabels: Record<string, string> = {
  ROLE_ADMIN: "Quản trị viên",
  ROLE_TEACHER: "Giáo viên",
  ROLE_GUARDIAN: "Người giám hộ",
};

export default function AccountPage() {
  const { session, loading, logout } = useAuth();
  const { api } = useClassroomSession("READ_OWN_ACCOUNT");
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
    has("MANAGE_USERS") && { href: "/admin/teachers", title: "Tài khoản giáo viên", text: "Thêm, vô hiệu hóa, đặt lại mật khẩu cho giáo viên.", tone: "bg-sky" },
    has("MANAGE_USERS") && { href: "/admin/guardians", title: "Tài khoản phụ huynh", text: "Gia đình đã đăng ký; vô hiệu hóa hoặc đặt lại mật khẩu.", tone: "bg-leaf-soft" },
    has("MANAGE_FAMILY") && { href: "/family", title: "Con của tôi", text: "Hồ sơ con, mã đăng nhập và trò chơi ở nhà.", tone: "bg-sun-soft" },
    has("MANAGE_FAMILY") && { href: "/family/join", title: "Vào lớp", text: "Gửi yêu cầu cho con vào lớp bằng mã mời của giáo viên.", tone: "bg-leaf-soft" },
    has("READ_GAMES") && { href: admin ? "/admin/games" : "/teacher/games", title: "Kho trò chơi", text: "Trò chơi đã duyệt, dùng chung cho mọi lớp.", tone: "bg-sky" },
    has("GENERATE_GAME_CONTENT") && { href: admin ? "/admin/games/create" : "/teacher/games/create", title: "Tạo trò chơi bằng AI", text: "Mô tả trò chơi, xem thử rồi lưu vào kho.", tone: "bg-sun-soft" },
    has("MANAGE_GAME_ASSETS") && has("READ_GAME_ASSETS") && { href: "/admin/game-assets", title: "Thư viện hình ảnh", text: "Học liệu và metadata cho trò chơi.", tone: "bg-sky" },
    has("READ_GAME_ASSETS") && { href: "/admin/game-preview", title: "Xem thử trò chơi", text: "Chạy thử GameContent với ảnh thật.", tone: "bg-sun-soft" },
  ].filter(Boolean) as { href: string; title: string; text: string; tone: string }[];

  return (
    <StaffPage>
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6">
        <header className="flex flex-wrap items-center gap-4">
          <span aria-hidden="true" className="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-line bg-leaf-soft text-2xl font-semibold">
            {user.fullName.trim().split(/\s+/).pop()?.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-wide text-leaf">
              {user.roles.map((role) => roleLabels[role] ?? role).join(", ") || "Chưa được cấp vai trò"}
            </p>
            <h1 id="account-heading" className="break-words font-display text-3xl font-extrabold leading-tight sm:text-4xl">
              Xin chào, {user.fullName}
            </h1>
            <p className="mt-0.5 break-words text-sm text-ink-soft">{user.email}</p>
          </div>
        </header>

        {api && <ProfileSections api={api} />}

        <ChangePasswordPanel />

        {shortcuts.length > 0 && (
          <h2 className="mt-8 text-base font-semibold">Lối tắt</h2>
        )}
        {shortcuts.length > 0 && (
          <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shortcuts.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="group flex h-full items-start justify-between gap-3 rounded-lg border border-line bg-paper px-4 py-3.5 transition hover:border-leaf/50 hover:bg-leaf-soft/40">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold group-hover:text-leaf">{item.title}</span>
                    <span className="mt-0.5 block text-[13px] leading-5 text-ink-soft">{item.text}</span>
                  </span>
                  <svg className="mt-0.5 shrink-0 text-ink-soft transition group-hover:translate-x-0.5 group-hover:text-leaf" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </Link>
              </li>
            ))}
          </ul>
        )}

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
