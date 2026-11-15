import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";

export const metadata: Metadata = {
  title: "LumiKids",
  description: "Đăng nhập hệ thống LumiKids",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // Browser extensions may add classes to <html> (e.g. "mdl-js") before hydration; ignore that one level only.
    <html
      lang="vi"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col"><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}
