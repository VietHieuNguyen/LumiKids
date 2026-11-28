"use client";
import { useState } from "react";
import type { ReactNode } from "react";
import type { AccountStatus, BulkAccountStatusResult } from "@lumikids/shared";
import { classroomError } from "../classrooms/api";
import { Dialog, StatusPill } from "../classrooms/classroom-shell";

/** Shared pieces of the admin account screens (teachers, guardians), in the admin table style. */
export const accountStatusView: Record<AccountStatus, { label: string; tone: "green" | "slate" | "amber" }> = {
  ACTIVE: { label: "Đang hoạt động", tone: "green" },
  PENDING_VERIFICATION: { label: "Chờ xác minh email", tone: "amber" },
  DISABLED: { label: "Đã vô hiệu hóa", tone: "slate" },
};

export function AccountStatusPill({ status }: { status: AccountStatus }) {
  const view = accountStatusView[status];
  return <StatusPill tone={view.tone}>{view.label}</StatusPill>;
}

export function initialOf(fullName: string): string {
  return fullName.trim().split(/\s+/).pop()?.charAt(0).toUpperCase() ?? "?";
}

export function Initial({ name, muted = false }: { name: string; muted?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line text-[13px] font-semibold ${muted ? "bg-cream text-ink-soft" : "bg-leaf-soft text-ink"}`}
    >
      {initialOf(name)}
    </span>
  );
}

export function StatusFilter<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { value: T; label: string; count: number }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex max-w-full flex-wrap gap-1 rounded-lg border border-line bg-paper p-1" role="group" aria-label="Lọc theo trạng thái">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`inline-flex min-h-11 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition sm:min-h-8 ${
            value === option.value ? "bg-ink text-paper" : "text-ink-soft hover:bg-leaf-soft hover:text-ink"
          }`}
        >
          {option.label}
          <span className="tabular-nums opacity-70">{option.count}</span>
        </button>
      ))}
    </div>
  );
}

export function SearchBox({ id, label, placeholder, value, onChange }: { id: string; label: string; placeholder: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="relative min-w-0 flex-1 sm:max-w-xs">
      <label className="sr-only" htmlFor={id}>{label}</label>
      <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <input id={id} type="search" className="asset-input w-full !pl-9" placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

export function KpiRow({ items }: { items: readonly { label: string; value: number | string; hint?: string }[] }) {
  return (
    <dl className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border border-line bg-paper px-4 py-3">
          <dt className="text-xs font-medium text-ink-soft">{item.label}</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums">{item.value}</dd>
          {item.hint && <dd className="text-xs text-ink-soft">{item.hint}</dd>}
        </div>
      ))}
    </dl>
  );
}

/**
 * Deactivate or reactivate an account. Spells out what happens, so the admin is not guessing;
 * deactivation also signs the person out everywhere (the API revokes their sessions).
 */
export function AccountStatusDialog({
  name,
  email,
  activate,
  consequences,
  onConfirm,
  onClose,
}: {
  name: string;
  email: string;
  activate: boolean;
  consequences: readonly string[];
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function confirm() {
    setBusy(true);
    setError("");
    try {
      await onConfirm();
      onClose();
    } catch (failure) {
      setError(classroomError(failure));
      setBusy(false);
    }
  }
  return (
    <Dialog title={activate ? "Kích hoạt lại tài khoản" : "Vô hiệu hóa tài khoản"} onClose={busy ? () => undefined : onClose}>
      <div className="flex items-center gap-3 rounded-lg border border-line bg-cream px-3 py-2.5">
        <Initial name={name} muted={!activate} />
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold">{name}</p>
          <p className="break-all text-xs text-ink-soft">{email}</p>
        </div>
      </div>
      <ul className="mt-4 space-y-2 text-sm leading-6">
        {consequences.map((line) => (
          <li key={line} className="flex gap-2">
            <span aria-hidden="true" className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${activate ? "bg-leaf" : "bg-berry"}`} />
            {line}
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="asset-error mt-4">{error}</p>}
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="asset-button-secondary" onClick={onClose} disabled={busy}>Hủy</button>
        <button type="button" className={activate ? "asset-button-primary" : "asset-button-danger"} onClick={() => void confirm()} disabled={busy}>
          {busy ? "Đang lưu…" : activate ? "Kích hoạt lại" : "Vô hiệu hóa"}
        </button>
      </div>
    </Dialog>
  );
}

/** Confirm a password reset before the one-time temporary password is shown. */
export function ResetPasswordDialog({ name, onConfirm, onClose }: { name: string; onConfirm: () => Promise<void>; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Dialog title="Đặt lại mật khẩu" onClose={busy ? () => undefined : onClose}>
      <p className="text-sm leading-6">
        Tạo mật khẩu tạm mới cho <strong>{name}</strong>. Mật khẩu cũ hết hiệu lực và tài khoản bị đăng xuất khỏi mọi thiết bị. Mật khẩu tạm chỉ hiện một lần.
      </p>
      {error && <p role="alert" className="asset-error mt-4">{error}</p>}
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="asset-button-secondary" onClick={onClose} disabled={busy}>Hủy</button>
        <button
          type="button"
          className="asset-button-primary"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setError("");
            onConfirm().catch((failure: unknown) => {
              setError(classroomError(failure));
              setBusy(false);
            });
          }}
        >
          {busy ? "Đang tạo…" : "Tạo mật khẩu tạm"}
        </button>
      </div>
    </Dialog>
  );
}

// ---------- Bulk selection ----------

const skipReasons: Record<BulkAccountStatusResult["skipped"][number]["reason"], string> = {
  NOT_FOUND: "không còn tồn tại",
  PENDING_VERIFICATION: "chưa xác minh email",
  UNCHANGED: "đã ở trạng thái này",
};

/** One confirmation for many accounts, then a summary of what changed and what was skipped. */
export function BulkStatusDialog({
  names,
  activate,
  consequences,
  onConfirm,
  onClose,
}: {
  names: ReadonlyMap<string, string>;
  activate: boolean;
  consequences: readonly string[];
  onConfirm: () => Promise<BulkAccountStatusResult>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<BulkAccountStatusResult | null>(null);
  const list = [...names.values()];
  async function confirm() {
    setBusy(true);
    setError("");
    try {
      setResult(await onConfirm());
    } catch (failure) {
      setError(classroomError(failure));
    } finally {
      setBusy(false);
    }
  }
  if (result)
    return (
      <Dialog title={activate ? "Đã kích hoạt lại" : "Đã vô hiệu hóa"} onClose={onClose}>
        <p className="text-sm leading-6">
          {result.updated.length > 0 ? <><strong>{result.updated.length}</strong> tài khoản đã được {activate ? "kích hoạt lại" : "vô hiệu hóa"}.</> : "Không có tài khoản nào thay đổi."}
        </p>
        {result.skipped.length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-semibold">Bỏ qua {result.skipped.length} tài khoản</p>
            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-[13px] text-ink-soft">
              {result.skipped.map((item) => (
                <li key={item.userId}><span className="text-ink">{names.get(item.userId) ?? "Tài khoản"}</span>: {skipReasons[item.reason]}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-6 flex justify-end">
          <button type="button" className="asset-button-primary" onClick={onClose}>Xong</button>
        </div>
      </Dialog>
    );
  return (
    <Dialog title={activate ? `Kích hoạt lại ${names.size} tài khoản` : `Vô hiệu hóa ${names.size} tài khoản`} onClose={busy ? () => undefined : onClose}>
      <p className="text-sm text-ink-soft">
        {list.slice(0, 5).join(", ")}
        {list.length > 5 && ` và ${list.length - 5} người khác`}
      </p>
      <ul className="mt-4 space-y-2 text-sm leading-6">
        {consequences.map((line) => (
          <li key={line} className="flex gap-2">
            <span aria-hidden="true" className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${activate ? "bg-leaf" : "bg-berry"}`} />
            {line}
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="asset-error mt-4">{error}</p>}
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="asset-button-secondary" onClick={onClose} disabled={busy}>Hủy</button>
        <button type="button" className={activate ? "asset-button-primary" : "asset-button-danger"} onClick={() => void confirm()} disabled={busy}>
          {busy ? "Đang lưu…" : activate ? `Kích hoạt lại ${names.size}` : `Vô hiệu hóa ${names.size}`}
        </button>
      </div>
    </Dialog>
  );
}

// ---------- Detail side panel ----------

/** A panel sliding in from the right; Esc, the close button or a click on the backdrop closes it. */
export function DetailDrawer({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <dialog
      ref={(node) => {
        if (node && !node.open) node.showModal();
      }}
      className="account-drawer"
      aria-labelledby="drawer-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 id="drawer-title" className="text-base font-semibold">{title}</h2>
          <button type="button" className="asset-icon-button -mr-2" onClick={onClose} aria-label="Đóng">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </dialog>
  );
}

export function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5 first:mt-0">
      {/* Not an h3: the admin theme resizes headings, and these are small labels. */}
      <p role="heading" aria-level={3} className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">{title}</p>
      {children}
    </section>
  );
}

export function DetailRows({ rows }: { rows: readonly [string, ReactNode][] }) {
  return (
    <dl className="divide-y divide-line rounded-lg border border-line">
      {rows.map(([label, value]) => (
        <div key={label} className="grid grid-cols-[156px_minmax(0,1fr)] gap-3 px-3 py-2 text-[13px]">
          <dt className="text-ink-soft">{label}</dt>
          <dd className="break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Opens the side panel when a row is clicked, except on its own controls (checkbox, links, buttons). */
export function openOnRowClick(open: () => void) {
  return {
    onClick: (event: { target: EventTarget }) => {
      if ((event.target as HTMLElement).closest("a, button, input, label")) return;
      open();
    },
    className: "cursor-pointer hover:bg-cream/70",
  };
}
