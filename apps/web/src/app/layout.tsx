import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "@/features/game-runtime/components/correct-answer-mascot.css";
import "@/features/game-runtime/components/game-completion.css";
import "@/features/game-runtime/environment/forest-gameplay.css";
import { AuthProvider } from "@/components/auth-provider";
import { SiteSettingsProvider } from "@/components/site-settings-provider";
import { lumiFontVariables } from "@/lib/lumi-fonts";

// Public origin of the site (e.g. https://lumikids.example), needed to turn share-image paths into absolute URLs.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

export const metadata: Metadata = {
  ...(siteUrl ? { metadataBase: new URL(siteUrl) } : {}),
  title: "LumiKids",
  icons: { icon: { url: "/brand/lumikids-logo.png", type: "image/png" }, apple: "/brand/lumikids-logo.png" },
  description: "Đăng nhập hệ thống LumiKids",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // Browser extensions may add classes to <html> (e.g. "mdl-js") before hydration; ignore that one level only.
    <html
      lang="vi"
      className={`${lumiFontVariables} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col"><SiteSettingsProvider><AuthProvider>{children}</AuthProvider></SiteSettingsProvider></body>
    </html>
  );
}
