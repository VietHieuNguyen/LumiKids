"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";

const roleLabels: Record<string, string> = {
  ROLE_ADMIN: "Quản trị viên",
  ROLE_TEACHER: "Giáo viên",
  ROLE_GUARDIAN: "Người giám hộ",
  ROLE_CHILD: "Trẻ em",
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
      <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4">
        <p role="status" className="text-sm text-slate-600">
          Đang kiểm tra phiên đăng nhập…
        </p>
      </main>
    );

  const user = session.user;
  return (
    <main className="min-h-dvh bg-slate-50 px-4 py-12">
      <section
        className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
        aria-labelledby="account-heading"
      >
        <p className="mb-8 text-xl font-bold tracking-tight text-blue-700">
          LumiKids
        </p>
        <p className="text-sm font-medium text-emerald-700">
          Đăng nhập thành công
        </p>
        <h1
          id="account-heading"
          className="mt-2 text-2xl font-semibold text-slate-900"
        >
          Xin chào, {user.fullName}
        </h1>
        <dl className="mt-7 space-y-5 border-y border-slate-100 py-6 text-sm">
          <div>
            <dt className="text-slate-500">Email</dt>
            <dd className="mt-1 break-words font-medium text-slate-900">
              {user.email}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Vai trò</dt>
            <dd className="mt-1 font-medium text-slate-900">
              {user.roles.map((role) => roleLabels[role] ?? role).join(", ") ||
                "Chưa được cấp vai trò"}
            </dd>
          </div>
        </dl>
        <p className="mt-6 text-sm leading-6 text-slate-600">
          Bạn đã truy cập được hệ thống bằng tài khoản của mình.
        </p>
        {user.permissions.includes("READ_GAMES") && (
          <Link
            href={
              user.permissions.includes("MANAGE_ALL_GAMES")
                ? "/admin/games"
                : "/teacher/games"
            }
            className="asset-button-primary mt-6"
          >
            Kho trò chơi →
          </Link>
        )}
        {user.permissions.includes("GENERATE_GAME_CONTENT") && (
          <Link
            href={
              user.permissions.includes("MANAGE_ALL_GAMES")
                ? "/admin/games/create"
                : "/teacher/games/create"
            }
            className="asset-button-secondary mt-3"
          >
            Tạo trò chơi bằng AI →
          </Link>
        )}
        {["MANAGE_GAME_ASSETS", "READ_GAME_ASSETS"].every((permission) =>
          user.permissions.includes(permission),
        ) && (
          <Link href="/admin/game-assets" className="asset-button-primary mt-6">
            Mở thư viện hình ảnh →
          </Link>
        )}
        {user.permissions.includes("READ_GAME_ASSETS") && (
          <Link
            href="/admin/game-preview"
            className="asset-button-secondary mt-3"
          >
            Xem thử trò chơi →
          </Link>
        )}
        {error && (
          <p
            role="alert"
            className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={handleLogout}
          disabled={submitting}
          className="mt-6 min-h-11 rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-wait disabled:opacity-60"
        >
          {submitting ? "Đang đăng xuất…" : "Đăng xuất"}
        </button>
      </section>
    </main>
  );
}
