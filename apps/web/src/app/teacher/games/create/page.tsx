"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { GameGenerationApi } from "@/features/game-creation/api";
import { GameCreator } from "@/features/game-creation/game-creator";
import { canCreateGames } from "@/features/game-creation/types";

export default function CreateTeacherGamePage() {
  const { session, loading, invalidateSession } = useAuth();
  const router = useRouter();
  const token = session?.accessToken;
  const currentToken = useRef(token);
  useEffect(() => {
    currentToken.current = token;
  }, [token]);
  const api = useMemo(
    () => (token ? new GameGenerationApi(token) : null),
    [token],
  );
  const unauthorized = useCallback(() => {
    if (currentToken.current !== token) return;
    invalidateSession();
    router.replace("/login");
  }, [invalidateSession, router, token]);
  useEffect(() => {
    if (!loading && !session) router.replace("/login");
  }, [loading, session, router]);
  if (loading || !session || !api)
    return (
      <main className="p-8">
        <p role="status">Đang kiểm tra phiên đăng nhập…</p>
      </main>
    );
  if (!canCreateGames(session.user))
    return (
      <main className="mx-auto max-w-xl p-8">
        <h1 className="text-xl font-semibold">
          Bạn chưa có quyền tạo trò chơi bằng AI.
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          Vui lòng liên hệ quản trị viên để được cấp quyền phù hợp.
        </p>
        <Link href="/account" className="asset-button-secondary mt-5">
          Về tài khoản
        </Link>
      </main>
    );
  return (
    <GameCreator
      key={session.user.userId}
      api={api}
      fullName={session.user.fullName}
      onUnauthorized={unauthorized}
    />
  );
}
