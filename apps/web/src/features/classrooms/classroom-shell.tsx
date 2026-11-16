"use client";
import Link from "next/link";
import type { ReactNode } from "react";

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
    <main className="min-h-dvh bg-slate-50 px-4 py-6 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <nav className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <Link className="font-medium text-blue-700 hover:underline" href={back?.href ?? "/account"}>
            ← {back?.label ?? "Tài khoản"}
          </Link>
        </nav>
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            {eyebrow && <p className="text-sm font-medium text-slate-500">{eyebrow}</p>}
            <h1 className="break-words text-2xl font-bold tracking-tight">{title}</h1>
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </header>
        {children}
      </div>
    </main>
  );
}

export function Panel({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{title}</h2>
          {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function StatusPill({ tone, children }: { tone: "green" | "slate" | "amber" | "red" | "blue"; children: ReactNode }) {
  const tones = {
    green: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
    amber: "bg-amber-50 text-amber-800 ring-amber-200",
    red: "bg-red-50 text-red-700 ring-red-200",
    blue: "bg-blue-50 text-blue-800 ring-blue-200",
  } as const;
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone]}`}>{children}</span>;
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-dvh bg-slate-50 p-8" role="status">
      {children}
    </main>
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
export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <dialog
      ref={(node) => {
        if (node && !node.open) node.showModal();
      }}
      className="asset-dialog max-w-md"
      aria-labelledby="dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="p-5 sm:p-6">
        <h2 id="dialog-title" className="text-lg font-semibold">{title}</h2>
        <div className="mt-4">{children}</div>
      </div>
    </dialog>
  );
}

