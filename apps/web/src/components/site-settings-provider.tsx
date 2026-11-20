"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { siteSettingsSchema } from "@lumikids/shared";
import type { SiteSettings } from "@lumikids/shared";

const apiOrigin = () => process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "";
const builtIn: SiteSettings = { siteName: "LumiKids", tagline: null, logoPath: null, landingScene: "VALLEY", updatedAt: null };

interface SiteSettingsValue {
  settings: SiteSettings;
  /** Absolute URL of the uploaded logo, or null for the built-in mark. */
  logoUrl: string | null;
  /** After an admin saves: show the new branding at once, without a reload. */
  replace: (settings: SiteSettings) => void;
}

const SiteSettingsContext = createContext<SiteSettingsValue>({ settings: builtIn, logoUrl: null, replace: () => undefined });

/**
 * Public branding (name, logo, landing scene). Pages render the built-in LumiKids branding first and
 * switch once the settings arrive, so a slow or offline API never blocks a page.
 */
export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings>(builtIn);
  useEffect(() => {
    const origin = apiOrigin();
    if (!origin) return;
    const controller = new AbortController();
    fetch(`${origin}/api/v1/site-settings`, { signal: controller.signal, cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((envelope: unknown) => {
        const parsed = siteSettingsSchema.safeParse((envelope as { data?: unknown } | null)?.data);
        if (parsed.success) setSettings(parsed.data);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  const logoUrl = settings.logoPath ? `${apiOrigin()}${settings.logoPath}` : null;
  useEffect(() => {
    // Keep the tab icon in step with the logo.
    const icon = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (icon) icon.href = logoUrl ?? "/brand/lumikids-logo.png";
  }, [logoUrl]);
  const replace = useCallback((next: SiteSettings) => setSettings(next), []);
  const value = useMemo(() => ({ settings, logoUrl, replace }), [settings, logoUrl, replace]);
  return <SiteSettingsContext.Provider value={value}>{children}</SiteSettingsContext.Provider>;
}

export function useSiteSettings() {
  return useContext(SiteSettingsContext);
}
