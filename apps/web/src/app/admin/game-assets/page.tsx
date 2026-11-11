"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { GameAssetsApi } from "@/features/game-assets/api";
import { AssetLibrary } from "@/features/game-assets/components/asset-library";

export default function GameAssetsPage() {
  const { session, loading, invalidateSession } = useAuth();
  const router = useRouter();
  const token = session?.accessToken;
  const client = useMemo(
    () => (token ? new GameAssetsApi(token) : null),
    [token],
  );
  useEffect(() => {
    if (!loading && !session) router.replace("/login");
  }, [loading, session, router]);

  if (loading || !session || !client)
    return (
      <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-5">
        <p role="status" className="text-sm text-slate-500">
          Đang kiểm tra phiên đăng nhập…
        </p>
      </main>
    );
  const allowed = ["MANAGE_GAME_ASSETS", "READ_GAME_ASSETS"].every(
    (permission) => session.user.permissions.includes(permission),
  );
  if (!allowed)
    return (
      <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-5">
        <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8">
          <p className="text-xl font-bold text-blue-700">LumiKids</p>
          <h1 className="mt-6 text-2xl font-semibold">
            Bạn chưa có quyền quản lý thư viện
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Trang này dành cho tài khoản được cấp quyền đọc và quản lý học liệu.
            Vui lòng liên hệ quản trị viên nếu bạn cần truy cập.
          </p>
          <Link href="/account" className="asset-button-secondary mt-6">
            Về tài khoản
          </Link>
        </section>
      </main>
    );
  return (
    <AssetLibrary
      key={session.user.userId}
      client={client}
      fullName={session.user.fullName}
      onSignIn={() => {
        invalidateSession();
        router.replace("/login");
      }}
    />
  );
}
