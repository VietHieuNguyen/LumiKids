"use client";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useChildAuth } from "@/components/child-auth-provider";
import { loginHref } from "@/lib/safe-return-path";
import { GameplayApi } from "./api";

/** Sign in with a code, then come back to the page the child was trying to open. */
function loginReturningHere(): string {
  return loginHref(`${window.location.pathname}${window.location.search}`);
}

/** Gameplay runs on the child's own session (login code), never on an adult account. */
export function useGameplaySession() {
  const { session, loading, invalidateSession, logout } = useChildAuth();
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
    logout,
    canPlay: session?.child.permissions.includes("PLAY_GAMES") ?? false,
  };
}
