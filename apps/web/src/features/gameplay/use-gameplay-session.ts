"use client";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { loginHref } from "@/lib/safe-return-path";
import { GameplayApi } from "./api";

/** Login, then come back to the page the child was trying to open. */
function loginReturningHere(): string {
  return loginHref(`${window.location.pathname}${window.location.search}`);
}

export function useGameplaySession() {
  const { session, loading, invalidateSession } = useAuth();
  const router = useRouter();
  const token = session?.accessToken;
  const current = useRef(token);
  useEffect(() => {
    current.current = token;
  }, [token]);
  const unauthorized = useCallback(() => {
    if (current.current !== token) return;
    invalidateSession();
    router.replace(loginReturningHere());
  }, [token, invalidateSession, router]);
  const api = useMemo(
    () => (token ? new GameplayApi(token, unauthorized) : null),
    [token, unauthorized],
  );
  useEffect(() => {
    if (!loading && !session) router.replace(loginReturningHere());
  }, [loading, session, router]);
  return {
    session,
    loading,
    api,
    canPlay: session?.user.permissions.includes("PLAY_GAMES") ?? false,
  };
}
