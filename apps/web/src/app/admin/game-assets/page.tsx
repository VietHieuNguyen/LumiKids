"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { Notice } from "@/features/classrooms/classroom-shell";
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
      <Notice>Đang kiểm tra phiên đăng nhập…</Notice>
    );
  const allowed = ["MANAGE_GAME_ASSETS", "READ_GAME_ASSETS"].every(
    (permission) => session.user.permissions.includes(permission),
  );
  if (!allowed)
    return (
      <Notice>
        <section className="w-full max-w-lg rounded-3xl border border-line bg-paper p-8">
          <h1 className="font-display text-2xl font-bold text-ink">
            Bạn chưa có quyền quản lý thư viện
          </h1>
          <p className="mt-3 text-sm leading-6 text-ink-soft">
            Trang này dành cho tài khoản được cấp quyền đọc và quản lý học liệu.
            Vui lòng liên hệ quản trị viên nếu bạn cần truy cập.
          </p>
          <Link href="/account" className="asset-button-secondary mt-6">
            Về tài khoản
          </Link>
        </section>
      </Notice>
    );
  return (
    <AssetLibrary
      key={session.user.userId}
      client={client}
      onSignIn={() => {
        invalidateSession();
        router.replace("/login");
      }}
    />
  );
}
