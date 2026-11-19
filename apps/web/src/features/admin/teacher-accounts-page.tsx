"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { IssuedPassword, TeacherAccount } from "@lumikids/shared";
import { classroomError } from "../classrooms/api";
import type { ClassroomApi } from "../classrooms/api";
import { ClassroomShell, Dialog, ErrorBanner, Notice, StatusPill } from "../classrooms/classroom-shell";
import { useClassroomSession } from "../classrooms/use-classroom-session";
import { useResource } from "../classrooms/use-resource";
import { AdminApi } from "./api";
import { lastSeenLabel } from "./format";

type Filter = "ACTIVE" | "DISABLED" | "ALL";

export function TeacherAccountsPage() {
  const { session, loading, api, allowed } = useClassroomSession("MANAGE_USERS");
  if (loading || !session || !api) return <Notice>Đang kiểm tra phiên đăng nhập…</Notice>;
  if (!allowed)
    return (
      <Notice>
        Tài khoản này không quản lý được giáo viên.{" "}
        <Link className="font-semibold text-leaf underline" href="/account">Về trang của bạn</Link>
      </Notice>
    );
  return <Accounts key={session.user.userId} api={api} />;
}

function Accounts({ api }: { api: ClassroomApi }) {
  const admin = useMemo(() => new AdminApi(api), [api]);
  const list = useResource((signal) => admin.teachers(signal), "teachers");
  const [filter, setFilter] = useState<Filter>("ACTIVE");
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<{ kind: "create" } | { kind: "edit"; account: TeacherAccount } | null>(null);
  const [issued, setIssued] = useState<{ result: IssuedPassword; reason: "created" | "reset" } | null>(null);
  const [now] = useState(() => new Date());

  const all = list.data ?? [];
  const counts = { ACTIVE: all.filter((a) => a.status === "ACTIVE").length, DISABLED: all.filter((a) => a.status === "DISABLED").length, ALL: all.length };
  const query = search.trim().toLowerCase();
  const shown = all.filter(
    (account) =>
      (filter === "ALL" || account.status === filter) &&
      (!query || account.fullName.toLowerCase().includes(query) || account.email.includes(query)),
  );
  const replace = (account: TeacherAccount) => {
    if (list.data) list.replace(list.data.map((item) => (item.userId === account.userId ? account : item)));
  };

  return (
    <ClassroomShell
      title="Giáo viên"
      eyebrow="Quản trị"
      back={{ href: "/admin", label: "Tổng quan" }}
      actions={
        <button type="button" className="lumi-button-sun" onClick={() => setDialog({ kind: "create" })}>
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M9 3v12M3 9h12" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
          Thêm giáo viên
        </button>
      }
    >
      {list.error && <ErrorBanner message={list.error} onRetry={list.reload} />}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-2xl border border-line bg-paper p-1" role="tablist" aria-label="Lọc theo trạng thái">
          {([
            ["ACTIVE", "Đang hoạt động"],
            ["DISABLED", "Đã khóa"],
            ["ALL", "Tất cả"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={filter === value}
              onClick={() => setFilter(value)}
              className={`min-h-10 rounded-xl px-3 text-sm font-semibold transition ${filter === value ? "bg-ink text-white" : "text-ink-soft hover:bg-cream hover:text-ink"}`}
            >
              {label} <span className="tabular-nums opacity-70">{counts[value]}</span>
            </button>
          ))}
        </div>
        <label className="sr-only" htmlFor="teacher-search">Tìm giáo viên</label>
        <input id="teacher-search" type="search" className="asset-input min-w-0 flex-1 sm:max-w-xs" placeholder="Tìm theo tên hoặc email…" value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>

      {list.loading && !list.data && <p role="status" className="text-ink-soft">Đang tải danh sách giáo viên…</p>}
      {list.data && shown.length === 0 && (
        <div className="rounded-3xl border border-dashed border-line bg-paper p-10 text-center">
          <p className="font-display text-xl font-bold">{all.length ? "Không có giáo viên phù hợp" : "Chưa có giáo viên nào"}</p>
          <p className="mt-1 text-sm text-ink-soft">{all.length ? "Thử bỏ lọc hoặc tìm tên khác." : "Thêm tài khoản để phân công giáo viên vào lớp."}</p>
        </div>
      )}
      <ul className="admin-teacher-list grid gap-3 md:grid-cols-2">
        {shown.map((account) => (
          <TeacherCard
            key={account.userId}
            account={account}
            now={now}
            admin={admin}
            onEdit={() => setDialog({ kind: "edit", account })}
            onChange={replace}
            onIssued={(result) => {
              replace(result.account);
              setIssued({ result, reason: "reset" });
            }}
          />
        ))}
      </ul>

      {dialog?.kind === "create" && (
        <TeacherForm
          admin={admin}
          onClose={() => setDialog(null)}
          onCreated={(result) => {
            setDialog(null);
            if (list.data) list.replace([...list.data, result.account].sort((a, b) => a.fullName.localeCompare(b.fullName, "vi")));
            setFilter("ACTIVE");
            setIssued({ result, reason: "created" });
          }}
        />
      )}
      {dialog?.kind === "edit" && (
        <TeacherForm
          admin={admin}
          account={dialog.account}
          onClose={() => setDialog(null)}
          onSaved={(account) => {
            setDialog(null);
            replace(account);
          }}
        />
      )}
      {issued && <PasswordDialog issued={issued.result} reason={issued.reason} onClose={() => setIssued(null)} />}
    </ClassroomShell>
  );
}

function TeacherCard({
  account,
  now,
  admin,
  onEdit,
  onChange,
  onIssued,
}: {
  account: TeacherAccount;
  now: Date;
  admin: AdminApi;
  onEdit: () => void;
  onChange: (account: TeacherAccount) => void;
  onIssued: (result: IssuedPassword) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = account.status === "ACTIVE";
  const activeClasses = account.classes.filter((item) => item.status === "ACTIVE");
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (failure) {
      setError(classroomError(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <li className={`admin-teacher-row flex flex-col rounded-3xl border border-line bg-paper p-5 ${active ? "" : "opacity-75"}`}>
      <div className="admin-teacher-identity flex items-start gap-3">
        <span aria-hidden="true" className={`grid h-12 w-12 shrink-0 place-items-center rounded-full font-display text-xl font-bold ring-1 ${active ? "bg-sun-soft ring-sun-edge/40" : "bg-ink/5 ring-line"}`}>
          {account.fullName.trim().split(/\s+/).pop()?.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="break-words font-display text-lg font-bold leading-tight">{account.fullName}</p>
          <p className="break-all text-sm text-ink-soft">{account.email}</p>
          {account.phone && <p className="text-sm text-ink-soft">{account.phone}</p>}
        </div>
        <StatusPill tone={active ? "green" : "slate"}>{active ? "Hoạt động" : "Đã khóa"}</StatusPill>
      </div>
      <dl className="admin-teacher-stats mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs font-semibold text-ink-soft">Đăng nhập gần nhất</dt>
          <dd className="font-semibold">{lastSeenLabel(account.lastLoginAt, now)}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-ink-soft">Lớp đang phụ trách</dt>
          <dd className="font-semibold">{activeClasses.length || "Chưa có"}</dd>
        </div>
      </dl>
      {activeClasses.length > 0 && (
        <ul className="admin-teacher-classes mt-3 flex flex-wrap gap-1.5">
          {activeClasses.map((item) => (
            <li key={item.classId}>
              <Link href={`/admin/classrooms/${item.classId}`} className="inline-flex min-h-8 items-center rounded-full bg-leaf-soft px-3 text-xs font-semibold text-leaf hover:bg-leaf hover:text-white">
                {item.className}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="admin-teacher-actions mt-auto flex flex-wrap gap-2 pt-4">
        <button type="button" className="asset-button-secondary" onClick={onEdit} disabled={busy}>Sửa</button>
        {active && (
          <button
            type="button"
            className="asset-button-secondary"
            disabled={busy}
            onClick={() => {
              if (window.confirm(`Đặt lại mật khẩu cho ${account.fullName}? Mật khẩu cũ hết hiệu lực và giáo viên bị đăng xuất khỏi mọi thiết bị.`))
                void run(async () => onIssued(await admin.resetPassword(account.userId)));
            }}
          >
            Đặt lại mật khẩu
          </button>
        )}
        <button
          type="button"
          className={active ? "asset-button-secondary text-berry" : "asset-button-primary"}
          disabled={busy}
          onClick={() => {
            const message = active
              ? `Khóa tài khoản ${account.fullName}? Giáo viên bị đăng xuất ngay và không đăng nhập được nữa. Lớp và bài đã giao vẫn giữ nguyên.`
              : `Mở khóa tài khoản ${account.fullName}?`;
            if (window.confirm(message))
              void run(async () => onChange(await admin.updateTeacher(account.userId, { status: active ? "DISABLED" : "ACTIVE" })));
          }}
        >
          {active ? "Khóa" : "Mở khóa"}
        </button>
      </div>
      {error && <p role="alert" className="asset-error mt-3">{error}</p>}
    </li>
  );
}

function TeacherForm({
  admin,
  account,
  onClose,
  onCreated,
  onSaved,
}: {
  admin: AdminApi;
  account?: TeacherAccount;
  onClose: () => void;
  onCreated?: (result: IssuedPassword) => void;
  onSaved?: (account: TeacherAccount) => void;
}) {
  const [fullName, setFullName] = useState(account?.fullName ?? "");
  const [email, setEmail] = useState(account?.email ?? "");
  const [phone, setPhone] = useState(account?.phone ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (account) onSaved?.(await admin.updateTeacher(account.userId, { fullName: fullName.trim(), phone: phone.trim() }));
      else onCreated?.(await admin.createTeacher({ fullName: fullName.trim(), email: email.trim(), phone: phone.trim() }));
    } catch (failure) {
      setError(classroomError(failure));
      setBusy(false);
    }
  }
  return (
    <Dialog title={account ? `Sửa ${account.fullName}` : "Thêm giáo viên"} onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <div>
          <label className="asset-label" htmlFor="teacher-name">Họ và tên</label>
          <input id="teacher-name" className="asset-input mt-1" required maxLength={120} autoComplete="off" value={fullName} onChange={(event) => setFullName(event.target.value)} />
        </div>
        <div>
          <label className="asset-label" htmlFor="teacher-email">Email đăng nhập</label>
          <input id="teacher-email" type="email" className="asset-input mt-1" required={!account} disabled={Boolean(account)} maxLength={254} autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} />
          {account && <p className="mt-1 text-xs text-ink-soft">Email là tên đăng nhập nên không đổi được.</p>}
        </div>
        <div>
          <label className="asset-label" htmlFor="teacher-phone">Số điện thoại (không bắt buộc)</label>
          <input id="teacher-phone" type="tel" className="asset-input mt-1" maxLength={20} autoComplete="off" value={phone} onChange={(event) => setPhone(event.target.value)} />
        </div>
        {!account && <p className="rounded-2xl bg-sky p-3 text-sm">Hệ thống tạo mật khẩu tạm và chỉ hiện <strong>một lần</strong>. Giáo viên nên đổi mật khẩu ở trang tài khoản sau khi đăng nhập.</p>}
        {error && <p role="alert" className="asset-error">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="asset-button-secondary" onClick={onClose} disabled={busy}>Hủy</button>
          <button className="asset-button-primary" disabled={busy || !fullName.trim() || (!account && !email.trim())}>
            {busy ? "Đang lưu…" : account ? "Lưu" : "Tạo tài khoản"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function PasswordDialog({ issued, reason, onClose }: { issued: IssuedPassword; reason: "created" | "reset"; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Dialog title={reason === "created" ? "Đã tạo tài khoản" : "Đã đặt lại mật khẩu"} onClose={onClose}>
      <p className="text-sm text-ink-soft">
        Gửi cho <strong className="text-ink">{issued.account.fullName}</strong> ({issued.account.email}) mật khẩu tạm dưới đây.
      </p>
      <div className="mt-4 rounded-3xl border-2 border-dashed border-sun-edge bg-sun-soft p-5 text-center">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">Mật khẩu tạm</p>
        <p className="mt-2 select-all break-all font-mono text-2xl font-bold tracking-wider sm:text-3xl">{issued.temporaryPassword}</p>
        <button
          type="button"
          className="asset-button-secondary mt-3"
          onClick={() => {
            void navigator.clipboard?.writeText(issued.temporaryPassword).then(
              () => setCopied(true),
              () => setCopied(false),
            );
          }}
        >
          {copied ? "Đã chép" : "Chép mật khẩu"}
        </button>
      </div>
      <p className="mt-4 rounded-2xl bg-[#fff4f1] p-3 text-sm text-[#8a2a17]">
        Mật khẩu chỉ hiện lần này, đóng hộp là không xem lại được. Nếu quên, hãy đặt lại mật khẩu mới.
      </p>
      <div className="mt-4 flex justify-end">
        <button type="button" className="asset-button-primary" onClick={onClose}>Tôi đã lưu mật khẩu</button>
      </div>
    </Dialog>
  );
}
