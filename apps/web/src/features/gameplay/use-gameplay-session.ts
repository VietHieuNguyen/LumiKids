"use client";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { GameplayApi } from "./api";

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
    router.replace("/login");
  }, [token, invalidateSession, router]);
  const api = useMemo(
    () => (token ? new GameplayApi(token, unauthorized) : null),
    [token, unauthorized],
  );
  useEffect(() => {
    if (!loading && !session) router.replace("/login");
  }, [loading, session, router]);
  return {
    session,
    loading,
    api,
    canPlay: session?.user.permissions.includes("PLAY_GAMES") ?? false,
  };
}
