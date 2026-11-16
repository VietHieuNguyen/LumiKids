"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { StaffPage } from "@/components/staff-shell";

/** Page frame shared by the admin and teacher classroom screens. */
export function ClassroomShell({
  title,
  eyebrow,
  back,
  actions,
  children,
}: {
  title: string;
  eyebrow?: string;
  back?: { href: string; label: string };
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <StaffPage>
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">
        {back && (
          <Link className="mb-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg text-sm font-semibold text-leaf hover:text-ink" href={back.href}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8H4m3.5-3.5L4 8l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            {back.label}
          </Link>
        )}
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            {eyebrow && <p className="text-sm font-semibold uppercase tracking-wide text-leaf">{eyebrow}</p>}
            <h1 className="break-words font-display text-3xl font-extrabold leading-tight sm:text-4xl">{title}</h1>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
        {children}
      </main>
    </StaffPage>
  );
}

export function Panel({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-line bg-paper p-4 shadow-[0_1px_0_rgb(24_56_41/4%),0_12px_32px_-20px_rgb(24_56_41/25%)] sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-bold">{title}</h2>
          {description && <p className="mt-1 text-sm leading-6 text-ink-soft">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function StatusPill({ tone, children }: { tone: "green" | "slate" | "amber" | "red" | "blue"; children: ReactNode }) {
  const tones = {
    green: "bg-leaf-soft text-leaf ring-leaf/25",
    slate: "bg-ink/5 text-ink-soft ring-ink/10",
    amber: "bg-sun-soft text-[#8a5a00] ring-sun-edge/40",
    red: "bg-[#fff1ee] text-berry ring-berry/25",
    blue: "bg-sky text-[#1d5a73] ring-[#1d5a73]/20",
  } as const;
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${tones[tone]}`}>{children}</span>;
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <StaffPage>
      <main className="mx-auto grid max-w-6xl place-items-center px-4 py-24 text-center text-ink-soft" role="status">
        {children}
      </main>
    </StaffPage>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="asset-error mb-4 flex flex-wrap items-center gap-3">
      <span className="min-w-0 flex-1">{message}</span>
      {onRetry && (
        <button type="button" className="asset-button-secondary" onClick={onRetry}>
          Thử lại
        </button>
      )}
    </div>
  );
}

/** A native <dialog> opened as a modal on mount; Escape and the close button both call onClose. */
export function Dialog({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <dialog
      ref={(node) => {
        if (node && !node.open) node.showModal();
      }}
      className={`asset-dialog ${wide ? "max-w-2xl" : "max-w-md"}`}
      aria-labelledby="dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="p-5 sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <h2 id="dialog-title" className="font-display text-2xl font-bold leading-tight">{title}</h2>
          <button type="button" className="asset-icon-button -mr-2 -mt-1" onClick={onClose} aria-label="Đóng">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </dialog>
  );
}

/** A tab strip whose tabs are links (so each tab has its own URL and survives reloads). */
export function TabLinks({ tabs, current }: { tabs: { id: string; label: string; href: string; badge?: number }[]; current: string }) {
  return (
    <nav aria-label="Mục" className="mb-6 flex gap-1 overflow-x-auto rounded-2xl border border-line bg-paper p-1">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          aria-current={tab.id === current ? "page" : undefined}
          className={`flex min-h-10 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-bold transition ${
            tab.id === current ? "bg-ink text-white" : "text-ink-soft hover:bg-cream hover:text-ink"
          }`}
        >
          {tab.label}
          {tab.badge ? <span className="rounded-full bg-sun px-1.5 text-xs text-ink">{tab.badge}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
