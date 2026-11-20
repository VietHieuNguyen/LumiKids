"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { GuardianAccount, IssuedGuardianPassword } from "@lumikids/shared";
import { classroomError } from "../classrooms/api";
import type { ClassroomApi } from "../classrooms/api";
import { ClassroomShell, ErrorBanner, Notice, StatusPill } from "../classrooms/classroom-shell";
import { useClassroomSession } from "../classrooms/use-classroom-session";
import { useResource } from "../classrooms/use-resource";
import { relationshipLabels } from "../family/api";
import { AdminApi } from "./api";
import { lastSeenLabel } from "./format";
import { PasswordDialog } from "./teacher-accounts-page";

type Filter = "ACTIVE" | "PENDING_VERIFICATION" | "DISABLED" | "ALL";

const statusView = {
  ACTIVE: { label: "Hoạt động", tone: "green" },
  PENDING_VERIFICATION: { label: "Chờ xác minh", tone: "amber" },
  DISABLED: { label: "Đã khóa", tone: "slate" },
} as const;

/** "2021-05-02" → whole years on `now`, for a short "4 tuổi" label. */
function ageLabel(dob: string, now: Date): string {
  const [year, month, day] = dob.split("-").map(Number);
  let age = now.getFullYear() - year;
  if (now.getMonth() + 1 < month || (now.getMonth() + 1 === month && now.getDate() < day)) age -= 1;
  return age < 1 ? "dưới 1 tuổi" : `${age} tuổi`;
}

export function GuardianAccountsPage() {
  const { session, loading, api, allowed } = useClassroomSession("MANAGE_USERS");
  if (loading || !session || !api) return <Notice>Đang kiểm tra phiên đăng nhập…</Notice>;
  if (!allowed)
    return (
      <Notice>
        Tài khoản này không quản lý được phụ huynh.{" "}
        <Link className="font-semibold text-leaf underline" href="/account">Về trang của bạn</Link>
      </Notice>
    );
  return <Accounts key={session.user.userId} api={api} />;
}

function Accounts({ api }: { api: ClassroomApi }) {
  const admin = useMemo(() => new AdminApi(api), [api]);
  const list = useResource((signal) => admin.guardians(signal), "guardians");
  const [filter, setFilter] = useState<Filter>("ACTIVE");
  const [search, setSearch] = useState("");
  const [issued, setIssued] = useState<IssuedGuardianPassword | null>(null);
  const [now] = useState(() => new Date());

  const all = list.data ?? [];
  const count = (status: Filter) => (status === "ALL" ? all.length : all.filter((account) => account.status === status).length);
  const query = search.trim().toLowerCase();
  const shown = all.filter(
    (account) =>
      (filter === "ALL" || account.status === filter) &&
      (!query ||
        account.fullName.toLowerCase().includes(query) ||
        account.email.includes(query) ||
        account.children.some((child) => child.fullName.toLowerCase().includes(query))),
  );
  const replace = (account: GuardianAccount) => {
    if (list.data) list.replace(list.data.map((item) => (item.userId === account.userId ? account : item)));
  };
  const withChildren = all.filter((account) => account.children.length > 0).length;
  const familyOnly = all.flatMap((account) => account.children).filter((child) => !child.classroom).length;

  return (
    <ClassroomShell title="Phụ huynh" eyebrow="Quản trị" back={{ href: "/admin", label: "Tổng quan" }}>
      {list.error && <ErrorBanner message={list.error} onRetry={list.reload} />}
      {list.data && (
        <dl className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Tài khoản", all.length],
            ["Chờ xác minh email", count("PENDING_VERIFICATION")],
            ["Đã thêm hồ sơ con", withChildren],
            ["Trẻ học tại nhà, chưa có lớp", familyOnly],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-line bg-paper p-4">
              <dt className="text-xs font-semibold text-ink-soft">{label}</dt>
              <dd className="mt-1 font-display text-2xl font-bold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1 rounded-2xl border border-line bg-paper p-1" role="tablist" aria-label="Lọc theo trạng thái">
          {([
            ["ACTIVE", "Đang hoạt động"],
            ["PENDING_VERIFICATION", "Chờ xác minh"],
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
              {label} <span className="tabular-nums opacity-70">{count(value)}</span>
            </button>
          ))}
        </div>
        <label className="sr-only" htmlFor="guardian-search">Tìm phụ huynh</label>
        <input id="guardian-search" type="search" className="asset-input min-w-0 flex-1 sm:max-w-xs" placeholder="Tìm theo tên, email hoặc tên con…" value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>

      {list.loading && !list.data && <p role="status" className="text-ink-soft">Đang tải danh sách phụ huynh…</p>}
      {list.data && shown.length === 0 && (
        <div className="rounded-3xl border border-dashed border-line bg-paper p-10 text-center">
          <p className="font-display text-xl font-bold">{all.length ? "Không có phụ huynh phù hợp" : "Chưa có phụ huynh nào"}</p>
          <p className="mt-1 text-sm text-ink-soft">{all.length ? "Thử bỏ lọc hoặc tìm tên khác." : "Phụ huynh tự đăng ký ở trang Đăng ký và xác minh bằng email."}</p>
        </div>
      )}
      <ul className="grid gap-3 md:grid-cols-2">
        {shown.map((account) => (
          <GuardianCard
            key={account.userId}
            account={account}
            now={now}
            admin={admin}
            onChange={replace}
            onIssued={(result) => {
              replace(result.account);
              setIssued(result);
            }}
          />
        ))}
      </ul>
      {issued && <PasswordDialog issued={issued} reason="reset" onClose={() => setIssued(null)} />}
    </ClassroomShell>
  );
}

function GuardianCard({
  account,
  now,
  admin,
  onChange,
  onIssued,
}: {
  account: GuardianAccount;
  now: Date;
  admin: AdminApi;
  onChange: (account: GuardianAccount) => void;
  onIssued: (result: IssuedGuardianPassword) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const view = statusView[account.status];
  const active = account.status === "ACTIVE";
  const pending = account.status === "PENDING_VERIFICATION";
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
    <li className={`flex flex-col rounded-3xl border border-line bg-paper p-5 ${account.status === "DISABLED" ? "opacity-75" : ""}`}>
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className={`grid h-12 w-12 shrink-0 place-items-center rounded-full font-display text-xl font-bold ring-1 ${active ? "bg-leaf-soft text-leaf ring-leaf/25" : "bg-ink/5 ring-line"}`}>
          {account.fullName.trim().split(/\s+/).pop()?.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="break-words font-display text-lg font-bold leading-tight">{account.fullName}</p>
          <p className="break-all text-sm text-ink-soft">{account.email}</p>
          <p className="text-sm text-ink-soft">
            {relationshipLabels[account.relationship]}
            {account.phone && ` · ${account.phone}`}
          </p>
        </div>
        <StatusPill tone={view.tone}>{view.label}</StatusPill>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs font-semibold text-ink-soft">Đăng ký</dt>
          <dd className="font-semibold">{new Date(account.createdAt).toLocaleDateString("vi-VN")}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-ink-soft">Đăng nhập gần nhất</dt>
          <dd className="font-semibold">{lastSeenLabel(account.lastLoginAt, now)}</dd>
        </div>
      </dl>
      <div className="mt-4">
        <p className="text-xs font-semibold text-ink-soft">Hồ sơ con ({account.children.length})</p>
        {account.children.length === 0 ? (
          <p className="mt-1 text-sm text-ink-soft">Chưa thêm hồ sơ con.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {account.children.map((child) => (
              <li key={child.childId} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-cream px-3 py-2 text-sm">
                <span className="font-semibold">
                  {child.fullName} <span className="font-normal text-ink-soft">· {ageLabel(child.dob, now)}</span>
                </span>
                {child.classroom ? (
                  <Link href={`/admin/classrooms/${child.classroom.classId}/children/${child.childId}`} className="inline-flex min-h-8 items-center rounded-full bg-leaf-soft px-3 text-xs font-semibold text-leaf hover:bg-leaf hover:text-white">
                    Lớp {child.classroom.className}
                  </Link>
                ) : (
                  <span className="text-xs font-semibold text-ink-soft">Học tại nhà</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {pending ? (
        <p className="mt-auto pt-4 text-sm text-ink-soft">Phụ huynh chưa nhập mã xác minh gửi qua email nên chưa đăng nhập được. Không cần thao tác gì.</p>
      ) : (
        <div className="mt-auto flex flex-wrap gap-2 pt-4">
          {active && (
            <button
              type="button"
              className="asset-button-secondary"
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Đặt lại mật khẩu cho ${account.fullName}? Mật khẩu cũ hết hiệu lực và phụ huynh bị đăng xuất khỏi mọi thiết bị.`))
                  void run(async () => onIssued(await admin.resetGuardianPassword(account.userId)));
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
                ? `Khóa tài khoản ${account.fullName}? Phụ huynh bị đăng xuất ngay. Hồ sơ con, lớp đang học và lịch sử chơi vẫn giữ nguyên.`
                : `Mở khóa tài khoản ${account.fullName}?`;
              if (window.confirm(message))
                void run(async () => onChange(await admin.updateGuardian(account.userId, { status: active ? "DISABLED" : "ACTIVE" })));
            }}
          >
            {active ? "Khóa" : "Mở khóa"}
          </button>
        </div>
      )}
      {error && <p role="alert" className="asset-error mt-3">{error}</p>}
    </li>
  );
}
