"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { GameAssetsApi } from "@/features/game-assets/api";
import { RuntimePreview } from "@/features/game-runtime/components/runtime-preview";

export default function GamePreviewPage() {
  const { session, loading } = useAuth();
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
      <main className="p-8">
        <p role="status">Đang kiểm tra phiên đăng nhập…</p>
      </main>
    );
  if (!session.user.permissions.includes("READ_GAME_ASSETS"))
    return (
      <main className="p-8">
        <h1 className="mb-4 text-xl font-semibold">
          Bạn chưa có quyền xem thử bằng ảnh thư viện.
        </h1>
        <Link href="/account" className="asset-button-secondary">
          Về tài khoản
        </Link>
      </main>
    );
  return (
    <RuntimePreview
      key={session.user.userId}
      client={client}
      canManageAssets={session.user.permissions.includes("MANAGE_GAME_ASSETS")}
    />
  );
}
