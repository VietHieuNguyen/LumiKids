"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import * as api from "@/lib/auth-api";

interface AuthContextValue {
  session: api.Session | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  invalidateSession: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<api.Session | null>(null);
  const [loading, setLoading] = useState(true);
  const version = useRef(0);

  useEffect(() => {
    let active = true;
    const currentVersion = version.current;
    api.refreshSession().then((restored) => {
      if (active && version.current === currentVersion) setSession(restored);
    }).catch(() => {
      // A visitor without a refresh cookie simply sees the login form.
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!session) return;
    const currentVersion = version.current;
    const timer = window.setTimeout(() => {
      api.refreshSession().then((renewed) => {
        if (version.current === currentVersion) setSession(renewed);
      }).catch(() => {
        if (version.current === currentVersion) setSession(null);
      });
    }, Math.max(session.expiresIn - 30, 1) * 1000);
    return () => window.clearTimeout(timer);
  }, [session]);

  const login = useCallback(async (email: string, password: string) => {
    const authenticated = await api.login(email, password);
    version.current += 1;
    setSession(authenticated);
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    version.current += 1;
    setSession(null);
  }, []);

  // A protected screen can clear a rejected in-memory session before returning to login.
  // Cookie refresh and login continue to use the existing auth flow.
  const invalidateSession = useCallback(() => {
    version.current += 1;
    setSession(null);
  }, []);

  return <AuthContext.Provider value={{ session, loading, login, logout, invalidateSession }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("AuthProvider is required.");
  return context;
}
