"use client";

import { useSiteSettings } from "@/components/site-settings-provider";

/** One brand mark shared by public, staff and children's screens: the admin's logo when one is set. */
export function LumiLogo({ size = 30 }: { size?: number }) {
  const { logoUrl } = useSiteSettings();
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- served by the API, sized like the built-in mark
    return <img src={logoUrl} alt="" aria-hidden="true" width={size} height={size} className="shrink-0 object-contain" style={{ width: size, height: size }} data-lumi-logo="true" />;
  }
  return (
    <svg width={size} height={size} viewBox="184 144 876 1056" aria-hidden="true" focusable="false" className="shrink-0" data-lumi-logo="true">
      {/* Frame the supplied transparent artwork without changing the source image. */}
      <image href="/brand/lumikids-logo.png" width="1169" height="1345" />
    </svg>
  );
}

export function LumiWordmark({ className = "" }: { className?: string }) {
  const { settings } = useSiteSettings();
  return <span className={`font-display font-extrabold tracking-tight ${className}`}>{settings.siteName}</span>;
}
