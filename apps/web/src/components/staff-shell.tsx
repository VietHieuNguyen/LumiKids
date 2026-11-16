"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth } from "@/components/auth-provider";
import { LumiLogo } from "@/components/lumi-logo";
import { homeFor } from "@/lib/home-for";

interface NavItem {
  href: string;
  label: string;
}

/** Where an adult can go, from their permissions (the API checks again on every request). */
function navFor(permissions: readonly string[]): NavItem[] {
  const items: NavItem[] = [];
  if (permissions.includes("MANAGE_CLASSROOMS")) items.push({ href: "/admin", label: "Tổng quan" });
  if (permissions.includes("READ_OWN_CLASSROOMS")) items.push({ href: "/teacher/classrooms", label: "Lớp của tôi" });
  if (permissions.includes("MANAGE_CLASSROOMS")) items.push({ href: "/admin/classrooms", label: "Quản lý lớp" });
  if (permissions.includes("MANAGE_USERS")) items.push({ href: "/admin/teachers", label: "Giáo viên" });
  if (permissions.includes("READ_GAMES"))
    items.push({ href: permissions.includes("MANAGE_ALL_GAMES") ? "/admin/games" : "/teacher/games", label: "Kho trò chơi" });
  if (permissions.includes("MANAGE_GAME_ASSETS")) items.push({ href: "/admin/game-assets", label: "Hình ảnh" });
  return items;
}

/** Top bar shared by the admin and teacher screens: brand, sections, account. */
export function StaffTopBar() {
  const { session } = useAuth();
  const pathname = usePathname();
  const items = navFor(session?.user.permissions ?? []);
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur supports-[backdrop-filter]:bg-paper/75">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link href={homeFor(session?.user.permissions ?? [])} className="flex shrink-0 items-center gap-2 rounded-xl font-display text-xl font-extrabold text-ink">
          <LumiLogo />
          <span className="hidden sm:inline">LumiKids</span>
        </Link>
        <nav aria-label="Khu vực" className="-mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto px-1">
          {items.map((item) => {
            // "/admin" is the dashboard only; its sub-sections have their own items.
            const active = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(`${item.href}/`));
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  active ? "bg-ink text-white" : "text-ink-soft hover:bg-cream hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        {session && (
          <Link
            href="/account"
            className="flex shrink-0 items-center gap-2 rounded-xl px-2 py-1.5 text-sm font-semibold text-ink-soft hover:bg-cream"
            aria-label={`Tài khoản: ${session.user.fullName}`}
          >
            <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-full bg-sun-soft font-display text-base font-bold text-ink ring-1 ring-sun-edge/40">
              {session.user.fullName.trim().split(/\s+/).pop()?.charAt(0).toUpperCase() ?? "?"}
            </span>
            <span className="hidden max-w-32 truncate md:inline">{session.user.fullName}</span>
          </Link>
        )}
      </div>
    </header>
  );
}

export function StaffPage({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-cream text-ink">
      <StaffTopBar />
      {children}
    </div>
  );
}
