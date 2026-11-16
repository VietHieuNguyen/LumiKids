"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import * as api from "@/lib/child-auth-api";

interface ChildAuthContextValue {
  session: api.ChildSession | null;
  loading: boolean;
  login: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  invalidateSession: () => void;
}

const ChildAuthContext = createContext<ChildAuthContextValue | null>(null);

/** The child's own session (login code), independent of any adult signed in on the same device. */
export function ChildAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<api.ChildSession | null>(null);
  const [loading, setLoading] = useState(true);
  const version = useRef(0);

  useEffect(() => {
    let active = true;
    const currentVersion = version.current;
    api.refreshChildSession().then((restored) => {
      if (active && version.current === currentVersion) setSession(restored);
    }).catch(() => {
      // No child cookie: the child is sent to the code form.
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!session) return;
    const currentVersion = version.current;
    const timer = window.setTimeout(() => {
      api.refreshChildSession().then((renewed) => {
        if (version.current === currentVersion) setSession(renewed);
      }).catch(() => {
        if (version.current === currentVersion) setSession(null);
      });
    }, Math.max(session.expiresIn - 30, 1) * 1000);
    return () => window.clearTimeout(timer);
  }, [session]);

  const login = useCallback(async (code: string) => {
    const authenticated = await api.childLogin(code);
    version.current += 1;
    setSession(authenticated);
  }, []);

  const logout = useCallback(async () => {
    await api.childLogout();
    version.current += 1;
    setSession(null);
  }, []);

  const invalidateSession = useCallback(() => {
    version.current += 1;
    setSession(null);
  }, []);

  return <ChildAuthContext.Provider value={{ session, loading, login, logout, invalidateSession }}>{children}</ChildAuthContext.Provider>;
}

export function useChildAuth(): ChildAuthContextValue {
  const context = useContext(ChildAuthContext);
  if (!context) throw new Error("ChildAuthProvider is required.");
  return context;
}
