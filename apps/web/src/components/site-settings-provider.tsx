"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { siteSettingsSchema } from "@lumikids/shared";
import type { SiteSettings } from "@lumikids/shared";
import { SETTINGS_DEADLINE_MS } from "@/features/landing/landing-scene-choice";

const apiOrigin = () => process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "";
const builtIn: SiteSettings = { siteName: "LumiKids", tagline: null, logoPath: null, landingScene: "VALLEY", updatedAt: null };

interface SiteSettingsValue {
  settings: SiteSettings;
  /** Absolute URL of the uploaded logo, or null for the built-in mark. */
  logoUrl: string | null;
  /** True once the saved settings arrived or the request gave up, so a page can wait before picking a 3D scene. */
  ready: boolean;
  /** True once the settings came from the API (not the built-in defaults after a failure or the deadline). */
  fromApi: boolean;
  /** After an admin saves: show the new branding at once, without a reload. */
  replace: (settings: SiteSettings) => void;
}

const SiteSettingsContext = createContext<SiteSettingsValue>({ settings: builtIn, logoUrl: null, ready: true, fromApi: false, replace: () => undefined });

/**
 * Public branding (name, logo, landing scene). Pages render the built-in LumiKids branding first and
 * switch once the settings arrive, so a slow or offline API never blocks a page.
 */
export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings>(builtIn);
  // Without an API there is nothing to wait for.
  const [ready, setReady] = useState(() => !apiOrigin());
  const [fromApi, setFromApi] = useState(false);
  useEffect(() => {
    const origin = apiOrigin();
    if (!origin) return;
    const controller = new AbortController();
    // A slow API must not hold pages that wait on `ready`: go on with the built-in settings, and still
    // take the real ones if they arrive later.
    const deadline = window.setTimeout(() => setReady(true), SETTINGS_DEADLINE_MS);
    fetch(`${origin}/api/v1/site-settings`, { signal: controller.signal, cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((envelope: unknown) => {
        const parsed = siteSettingsSchema.safeParse((envelope as { data?: unknown } | null)?.data);
        if (parsed.success) {
          setSettings(parsed.data);
          setFromApi(true);
        }
        setReady(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) setReady(true);
      });
    return () => {
      window.clearTimeout(deadline);
      controller.abort();
    };
  }, []);
  const logoUrl = settings.logoPath ? `${apiOrigin()}${settings.logoPath}` : null;
  useEffect(() => {
    // Keep the tab icon in step with the logo.
    const icon = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (icon) icon.href = logoUrl ?? "/brand/lumikids-logo.png";
  }, [logoUrl]);
  const replace = useCallback((next: SiteSettings) => {
    setSettings(next);
    setFromApi(true);
  }, []);
  const value = useMemo(() => ({ settings, logoUrl, ready, fromApi, replace }), [settings, logoUrl, ready, fromApi, replace]);
  return <SiteSettingsContext.Provider value={value}>{children}</SiteSettingsContext.Provider>;
}

export function useSiteSettings() {
  return useContext(SiteSettingsContext);
}
