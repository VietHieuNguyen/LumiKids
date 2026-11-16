import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";
import { lumiFontVariables } from "@/lib/lumi-fonts";

// Public origin of the site (e.g. https://lumikids.example), needed to turn share-image paths into absolute URLs.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

export const metadata: Metadata = {
  ...(siteUrl ? { metadataBase: new URL(siteUrl) } : {}),
  title: "LumiKids",
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
      <body className="min-h-full flex flex-col"><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}
