import type { Metadata } from "next";
import type { ReactNode } from "react";
import { lumiFontVariables } from "@/lib/lumi-fonts";
import "../login/login.css";

export const metadata: Metadata = {
  title: "Xác minh email — LumiKids",
  description: "Nhập mã xác minh email LumiKids",
};

export default function VerifyEmailLayout({ children }: { children: ReactNode }) {
  return <div className={`${lumiFontVariables} lg-shell`}>{children}</div>;
}
