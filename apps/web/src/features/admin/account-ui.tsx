"use client";
import { useState } from "react";
import type { AccountStatus } from "@lumikids/shared";
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
    <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg border border-line bg-paper p-1" role="tablist" aria-label="Lọc theo trạng thái">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={`inline-flex min-h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-[13px] font-medium transition ${
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

export function KpiRow({ items }: { items: readonly { label: string; value: number; hint?: string }[] }) {
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
