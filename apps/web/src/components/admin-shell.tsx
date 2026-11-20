"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { useAuth } from "@/components/auth-provider";
import { LumiLogo, LumiWordmark } from "@/components/lumi-logo";
import "./admin-shell.css";

const adminSections = [
  { href: "/admin", label: "Tổng quan", permission: "MANAGE_CLASSROOMS", icon: "M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h6v6h-6z" },
  { href: "/admin/classrooms", label: "Quản lý lớp", permission: "MANAGE_CLASSROOMS", icon: "M3 21V7l9-4 9 4v14M8 21v-6h8v6M7 9h2m6 0h2M7 12h2m6 0h2M1 21h22" },
  { href: "/admin/teachers", label: "Giáo viên", permission: "MANAGE_USERS", icon: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M18 8a3 3 0 0 1 0 6m4 7v-2a4 4 0 0 0-3-4" },
  { href: "/admin/games", label: "Kho trò chơi", permission: "READ_GAMES", icon: "M7 8h10a4 4 0 0 1 4 3l1 7a2 2 0 0 1-3 2l-4-3H9l-4 3a2 2 0 0 1-3-2l1-7a4 4 0 0 1 4-3ZM6 12v4m-2-2h4m8-1h.01m3 2h.01" },
  { href: "/admin/game-assets", label: "Hình ảnh", permission: "MANAGE_GAME_ASSETS", icon: "M3 3h18v18H3zM3 17l6-6 4 4 3-3 5 5M16 7h.01" },
  { href: "/admin/token-usage", label: "Mức sử dụng AI", permission: "MANAGE_USERS", icon: "M4 20h16M6 16v-5m6 5V4m6 12V8" },
] as const;

const teacherSections = [
  { href: "/teacher/classrooms", label: "Lớp của tôi", permission: "READ_OWN_CLASSROOMS", icon: adminSections[1].icon },
  { href: "/teacher/games", label: "Kho trò chơi", permission: "READ_GAMES", icon: adminSections[3].icon },
  { href: "/teacher/lesson-plans", label: "Giáo án", permission: "MANAGE_LESSON_PLANS", icon: "M4 4h10a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4ZM18 8h2v12M8 9h6M8 13h6" },
  { href: "/teacher/token-usage", label: "Mức sử dụng AI", permission: "READ_OWN_ACCOUNT", icon: "M4 20h16M6 16v-5m6 5V4m6 12V8" },
] as const;

const guardianSections = [
  { href: "/family", label: "Con của tôi", permission: "MANAGE_FAMILY", icon: "M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10Z" },
  { href: "/family/join", label: "Vào lớp", permission: "MANAGE_FAMILY", icon: "M3 21V7l9-4 9 4v14M9 21v-6h6v6M12 7v4m-2-2h4" },
] as const;

type Variant = "admin" | "teacher" | "guardian";
const variants = {
  admin: { sections: adminSections, area: "Quản trị", home: "/admin", homeLabel: "Tổng quan", footer: "Không gian quản trị" },
  teacher: { sections: teacherSections, area: "Giáo viên", home: "/teacher/classrooms", homeLabel: "Lớp của tôi", footer: "Không gian giáo viên" },
  guardian: { sections: guardianSections, area: "Gia đình", home: "/family", homeLabel: "Con của tôi", footer: "Không gian gia đình" },
} as const;

function Icon({ path }: { path: string }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg>;
}

/** Shared dashboard presentation; navigation remains specific to each staff area. */
export function AdminShell({ children, variant = "admin" }: { children: ReactNode; variant?: Variant }) {
  const { session } = useAuth();
  const pathname = usePathname();
  const { sections, area, home, homeLabel, footer } = variants[variant];
  const drawer = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const closeOnDesktop = () => { if (desktop.matches) drawer.current?.close(); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);
  const current: (typeof sections)[number] =
    [...sections]
      .sort((a, b) => b.href.length - a.href.length)
      .find((item) => item.href !== "/admin" && (pathname.startsWith(item.href) || (item.href === "/admin/games" && pathname === "/admin/game-preview"))) ?? sections[0];
  const title = pathname === "/account" ? "Tài khoản" : pathname.endsWith("/assignments/new") ? "Giao bài mới" : pathname.endsWith("/create") ? "Tạo trò chơi" : pathname === "/admin/game-preview" ? "Xem thử trò chơi" : current.label;
  function closeDrawer() { drawer.current?.close(); }
  const links = <>
    <Link className="admin-brand" href={home} aria-label={`LumiKids — ${homeLabel}`}><LumiLogo size={36} /><LumiWordmark /></Link>
    <nav className="admin-navigation" aria-label={`Điều hướng ${area.toLowerCase()}`}>
      {sections.filter((item) => session?.user.permissions.includes(item.permission)).map((item) => (
        <Link key={item.href} href={item.href} onClick={closeDrawer} aria-current={pathname !== "/account" && current.href === item.href ? "page" : undefined}>
          <Icon path={item.icon} />{item.label}
        </Link>
      ))}
    </nav>
    <div className="admin-sidebar-footer">{footer}</div>
  </>;
  return (
    <div className={`admin-shell ${variant !== "admin" ? "teacher-dashboard" : ""}`} data-staff-area={variant}>
      <a className="admin-skip" href="#admin-content">Đến nội dung chính</a>
      <aside className="admin-sidebar">{links}</aside>
      <dialog ref={drawer} className="admin-drawer" aria-label={`Menu ${area.toLowerCase()}`} onClick={(event) => { if (event.target === event.currentTarget) closeDrawer(); }} onClose={() => trigger.current?.focus()}>
        <div className="admin-drawer-content"><button type="button" className="admin-drawer-close" onClick={closeDrawer} aria-label="Đóng menu"><Icon path="M6 6l12 12M18 6 6 18" /></button>{links}</div>
      </dialog>
      <div className="admin-workspace">
        <header className="admin-topbar" data-staff-header="true">
          <button ref={trigger} type="button" className="admin-menu-button" onClick={() => drawer.current?.showModal()} aria-label={`Mở menu ${area.toLowerCase()}`} aria-haspopup="dialog"><Icon path="M3 6h18M3 12h18M3 18h18" /></button>
          <div className="admin-page-label"><span>{area}</span><span aria-hidden="true">/</span><strong>{title}</strong></div>
          {session && <Link className="admin-account" href="/account" aria-label={`Tài khoản: ${session.user.fullName}`}><span className="admin-avatar" aria-hidden="true">{session.user.fullName.trim().split(/\s+/).pop()?.charAt(0).toUpperCase()}</span><span>{session.user.fullName}</span></Link>}
        </header>
        <div id="admin-content" className="admin-content" tabIndex={-1}>{children}</div>
      </div>
    </div>
  );
}
