"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth } from "@/components/auth-provider";
import { AdminShell } from "@/components/admin-shell";

/** Staff share the dashboard theme; each area keeps its own navigation and permissions. */
export function StaffPage({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { session } = useAuth();
  const admin = pathname === "/admin" || pathname.startsWith("/admin/") ||
    (pathname === "/account" && !!session?.user.permissions.includes("MANAGE_CLASSROOMS"));
  const permissions = session?.user.permissions ?? [];
  const guardian = pathname === "/family" || pathname.startsWith("/family/") ||
    (pathname === "/account" && permissions.includes("MANAGE_FAMILY") && !permissions.includes("READ_OWN_CLASSROOMS"));
  return <AdminShell variant={admin ? "admin" : guardian ? "guardian" : "teacher"}>{children}</AdminShell>;
}
