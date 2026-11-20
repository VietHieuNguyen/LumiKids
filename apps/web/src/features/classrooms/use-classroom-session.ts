"use client";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { loginHref } from "@/lib/safe-return-path";
import { GameLibraryApi } from "../game-library/api";
import { ClassroomApi } from "./api";

function loginReturningHere(): string {
  return loginHref(`${window.location.pathname}${window.location.search}`);
}

/** Adult session for the classroom screens; `permission` decides whether the screen is shown at all. */
export function useClassroomSession(permission: "MANAGE_CLASSROOMS" | "READ_OWN_CLASSROOMS" | "MANAGE_USERS" | "MANAGE_FAMILY" | "MANAGE_LESSON_PLANS" | "READ_OWN_ACCOUNT") {
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
  const api = useMemo(() => (token ? new ClassroomApi(token, unauthorized) : null), [token, unauthorized]);
  const libraryApi = useMemo(() => (token ? new GameLibraryApi(token, unauthorized) : null), [token, unauthorized]);
  useEffect(() => {
    if (!loading && !session) router.replace(loginReturningHere());
  }, [loading, session, router]);
  const permissions = session?.user.permissions ?? [];
  return {
    session,
    loading,
    api,
    libraryApi,
    allowed: permissions.includes(permission),
    canIssueCodes: permissions.includes("RESET_CHILD_LOGIN_CODES"),
    canAssign: permissions.includes("ASSIGN_ACTIVITIES"),
    canManageUsers: permissions.includes("MANAGE_USERS"),
    canInvite: permissions.includes("MANAGE_CLASS_INVITES"),
  };
}
