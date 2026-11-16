import type { Metadata } from "next";
import type { ReactNode } from "react";
import { lumiFontVariables } from "@/lib/lumi-fonts";
import "./login.css";

export const metadata: Metadata = {
  title: "Đăng nhập — LumiKids",
  description: "Đăng nhập hệ thống LumiKids",
};

export default function LoginLayout({ children }: { children: ReactNode }) {
  return <div className={`${lumiFontVariables} lg-shell`}>{children}</div>;
}
