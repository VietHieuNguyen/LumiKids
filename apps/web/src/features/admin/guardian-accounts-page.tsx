"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { GuardianAccount, IssuedGuardianPassword } from "@lumikids/shared";
import type { ClassroomApi } from "../classrooms/api";
import { ClassroomShell, ErrorBanner, Notice, Panel } from "../classrooms/classroom-shell";
import { useClassroomSession } from "../classrooms/use-classroom-session";
import { useResource } from "../classrooms/use-resource";
import { relationshipLabels } from "../family/api";
import { AccountStatusDialog, AccountStatusPill, Initial, KpiRow, ResetPasswordDialog, SearchBox, StatusFilter } from "./account-ui";
import { AdminApi } from "./api";
import { lastSeenLabel } from "./format";
import { PasswordDialog } from "./teacher-accounts-page";

type Filter = "ACTIVE" | "PENDING_VERIFICATION" | "DISABLED" | "ALL";
type Pending = { kind: "status" | "reset"; account: GuardianAccount } | null;

/** "2021-05-02" → whole years on `now`. */
function ageLabel(dob: string, now: Date): string {
  const [year, month, day] = dob.split("-").map(Number);
  let age = now.getFullYear() - year;
  if (now.getMonth() + 1 < month || (now.getMonth() + 1 === month && now.getDate() < day)) age -= 1;
  return age < 1 ? "dưới 1 tuổi" : `${age} tuổi`;
}
const dateLabel = (value: string) => new Date(value).toLocaleDateString("vi-VN");

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
  const [filter, setFilter] = useState<Filter>("ALL");
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<Pending>(null);
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
  const children = all.flatMap((account) => account.children);

  return (
    <ClassroomShell title="Phụ huynh" eyebrow="Quản trị">
      {list.error && <ErrorBanner message={list.error} onRetry={list.reload} />}
      {list.data && (
        <KpiRow
          items={[
            { label: "Tài khoản phụ huynh", value: all.length },
            { label: "Đang hoạt động", value: count("ACTIVE") },
            { label: "Chờ xác minh email", value: count("PENDING_VERIFICATION") },
            { label: "Hồ sơ trẻ", value: children.length, hint: `${children.filter((child) => !child.classroom).length} trẻ chưa có lớp` },
          ]}
        />
      )}

      <Panel title="Tài khoản phụ huynh" description="Phụ huynh tự đăng ký và xác minh bằng email. Quản trị viên có thể vô hiệu hóa, kích hoạt lại hoặc đặt lại mật khẩu.">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <StatusFilter
            value={filter}
            onChange={setFilter}
            options={[
              { value: "ALL", label: "Tất cả", count: count("ALL") },
              { value: "ACTIVE", label: "Đang hoạt động", count: count("ACTIVE") },
              { value: "PENDING_VERIFICATION", label: "Chờ xác minh", count: count("PENDING_VERIFICATION") },
              { value: "DISABLED", label: "Đã vô hiệu hóa", count: count("DISABLED") },
            ]}
          />
          <SearchBox id="guardian-search" label="Tìm phụ huynh" placeholder="Tên, email hoặc tên con…" value={search} onChange={setSearch} />
        </div>

        {list.loading && !list.data && <p role="status" className="py-6 text-sm text-ink-soft">Đang tải danh sách phụ huynh…</p>}
        {list.data && shown.length === 0 && (
          <div className="rounded-lg border border-dashed border-line px-4 py-10 text-center">
            <p className="text-sm font-semibold">{all.length ? "Không có phụ huynh phù hợp" : "Chưa có phụ huynh nào"}</p>
            <p className="mt-1 text-sm text-ink-soft">{all.length ? "Thử bỏ lọc hoặc tìm tên khác." : "Phụ huynh tự đăng ký ở trang Đăng ký."}</p>
          </div>
        )}

        {shown.length > 0 && (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="border-b border-line text-ink-soft">
                  <tr>
                    <th className="w-[30%] px-3 py-2 font-medium">Phụ huynh</th>
                    <th className="w-[28%] px-3 py-2 font-medium">Con</th>
                    <th className="whitespace-nowrap px-3 py-2 font-medium">Hoạt động</th>
                    <th className="px-3 py-2 font-medium">Trạng thái</th>
                    <th className="px-3 py-2 text-right font-medium"><span className="sr-only">Thao tác</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {shown.map((account) => (
                    <tr key={account.userId} className={`align-top ${account.status === "DISABLED" ? "text-ink-soft" : ""}`}>
                      <td className="px-3 py-3">
                        <div className="flex items-start gap-3">
                          <Initial name={account.fullName} muted={account.status !== "ACTIVE"} />
                          <div className="min-w-0">
                            <p className="break-words font-semibold text-ink">{account.fullName}</p>
                            <p className="max-w-[240px] truncate text-xs text-ink-soft" title={account.email}>{account.email}</p>
                            <p className="text-xs text-ink-soft">
                              {relationshipLabels[account.relationship]}
                              {account.phone && ` · ${account.phone}`}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3"><ChildrenList account={account} now={now} /></td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <p>{lastSeenLabel(account.lastLoginAt, now)}</p>
                        <p className="text-xs tabular-nums text-ink-soft">Đăng ký {dateLabel(account.createdAt)}</p>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3"><AccountStatusPill status={account.status} /></td>
                      <td className="px-3 py-3"><RowActions account={account} onPick={setPending} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-line md:hidden">
              {shown.map((account) => (
                <li key={account.userId} className="py-4 first:pt-0">
                  <div className="flex items-start gap-3">
                    <Initial name={account.fullName} muted={account.status !== "ACTIVE"} />
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-semibold">{account.fullName}</p>
                      <p className="truncate text-xs text-ink-soft" title={account.email}>{account.email}</p>
                      <p className="mt-0.5 text-xs text-ink-soft">
                        {relationshipLabels[account.relationship]} · Đăng nhập: {lastSeenLabel(account.lastLoginAt, now).toLowerCase()}
                      </p>
                    </div>
                    <AccountStatusPill status={account.status} />
                  </div>
                  <div className="mt-3 pl-11"><ChildrenList account={account} now={now} /></div>
                  <div className="mt-3 pl-11"><RowActions account={account} onPick={setPending} /></div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>

      {pending?.kind === "status" && (
        <AccountStatusDialog
          name={pending.account.fullName}
          email={pending.account.email}
          activate={pending.account.status === "DISABLED"}
          consequences={
            pending.account.status === "DISABLED"
              ? ["Phụ huynh đăng nhập lại được bằng mật khẩu hiện tại.", "Hồ sơ con, lớp và lịch sử chơi vẫn như trước."]
              : [
                  "Phụ huynh bị đăng xuất ngay trên mọi thiết bị và không đăng nhập được nữa.",
                  "Hồ sơ con, lớp đang học và lịch sử chơi được giữ nguyên.",
                  "Mã đăng nhập của trẻ vẫn dùng được; trẻ trong lớp vẫn chơi bài cô giao.",
                  "Có thể kích hoạt lại bất cứ lúc nào.",
                ]
          }
          onConfirm={async () => replace(await admin.updateGuardian(pending.account.userId, { status: pending.account.status === "DISABLED" ? "ACTIVE" : "DISABLED" }))}
          onClose={() => setPending(null)}
        />
      )}
      {pending?.kind === "reset" && (
        <ResetPasswordDialog
          name={pending.account.fullName}
          onClose={() => setPending(null)}
          onConfirm={async () => {
            const result = await admin.resetGuardianPassword(pending.account.userId);
            replace(result.account);
            setPending(null);
            setIssued(result);
          }}
        />
      )}
      {issued && <PasswordDialog issued={issued} reason="reset" onClose={() => setIssued(null)} />}
    </ClassroomShell>
  );
}

function ChildrenList({ account, now }: { account: GuardianAccount; now: Date }) {
  if (account.children.length === 0) return <span className="text-xs text-ink-soft">Chưa thêm hồ sơ con</span>;
  return (
    <ul className="space-y-1">
      {account.children.map((child) => (
        <li key={child.childId} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]">
          <span className="whitespace-nowrap font-medium text-ink">{child.fullName}</span>
          <span className="whitespace-nowrap text-xs text-ink-soft">{ageLabel(child.dob, now)}</span>
          {child.classroom ? (
            <Link
              href={`/admin/classrooms/${child.classroom.classId}/children/${child.childId}`}
              className="inline-flex min-h-6 items-center whitespace-nowrap rounded border border-line px-1.5 text-xs text-leaf hover:bg-leaf-soft"
            >
              Lớp {child.classroom.className}
            </Link>
          ) : (
            <span className="inline-flex min-h-6 items-center whitespace-nowrap rounded bg-cream px-1.5 text-xs text-ink-soft">Học tại nhà</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function RowActions({ account, onPick }: { account: GuardianAccount; onPick: (pending: Pending) => void }) {
  if (account.status === "PENDING_VERIFICATION")
    return <span className="sr-only">Chưa có thao tác: phụ huynh chưa xác minh email</span>;
  const active = account.status === "ACTIVE";
  return (
    <div className="flex flex-wrap gap-2 md:flex-nowrap md:justify-end">
      {active && (
        <button type="button" className="asset-button-secondary whitespace-nowrap" onClick={() => onPick({ kind: "reset", account })}>
          Đặt lại mật khẩu
        </button>
      )}
      <button
        type="button"
        className={`whitespace-nowrap ${active ? "asset-button-secondary text-berry" : "asset-button-primary"}`}
        onClick={() => onPick({ kind: "status", account })}
      >
        {active ? "Vô hiệu hóa" : "Kích hoạt lại"}
      </button>
    </div>
  );
}
