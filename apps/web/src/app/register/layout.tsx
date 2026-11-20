import type { Metadata } from "next";
import type { ReactNode } from "react";
import { lumiFontVariables } from "@/lib/lumi-fonts";
import "../login/login.css";

export const metadata: Metadata = {
  title: "Phụ huynh đăng ký — LumiKids",
  description: "Tạo tài khoản phụ huynh LumiKids",
};

export default function RegisterLayout({ children }: { children: ReactNode }) {
  return <div className={`${lumiFontVariables} lg-shell`}>{children}</div>;
}
