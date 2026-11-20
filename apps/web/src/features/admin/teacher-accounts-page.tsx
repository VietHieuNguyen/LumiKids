"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { IssuedPassword, TeacherAccount } from "@lumikids/shared";
import { classroomError } from "../classrooms/api";
import type { ClassroomApi } from "../classrooms/api";
import { ClassroomShell, Dialog, ErrorBanner, Notice, Panel } from "../classrooms/classroom-shell";
import { useClassroomSession } from "../classrooms/use-classroom-session";
import { useResource } from "../classrooms/use-resource";
import { AdminApi } from "./api";
import { lastSeenLabel } from "./format";
import { AccountStatusDialog, AccountStatusPill, Initial, KpiRow, ResetPasswordDialog, SearchBox, StatusFilter } from "./account-ui";

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
  const [filter, setFilter] = useState<Filter>("ALL");
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<{ kind: "create" } | { kind: "edit" | "status" | "reset"; account: TeacherAccount } | null>(null);
  const [issued, setIssued] = useState<{ result: IssuedPassword; reason: "created" | "reset" } | null>(null);
  const [now] = useState(() => new Date());

  const all = list.data ?? [];
  const count = (status: Filter) => (status === "ALL" ? all.length : all.filter((account) => account.status === status).length);
  const query = search.trim().toLowerCase();
  const shown = all.filter(
    (account) =>
      (filter === "ALL" || account.status === filter) &&
      (!query || account.fullName.toLowerCase().includes(query) || account.email.includes(query)),
  );
  const replace = (account: TeacherAccount) => {
    if (list.data) list.replace(list.data.map((item) => (item.userId === account.userId ? account : item)));
  };
  const activeClasses = (account: TeacherAccount) => account.classes.filter((item) => item.status === "ACTIVE");
  const unassigned = all.filter((account) => account.status === "ACTIVE" && activeClasses(account).length === 0).length;

  return (
    <ClassroomShell
      title="Giáo viên"
      eyebrow="Quản trị"
      actions={
        <button type="button" className="lumi-button-sun" onClick={() => setDialog({ kind: "create" })}>
          <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true"><path d="M9 3v12M3 9h12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
          Thêm giáo viên
        </button>
      }
    >
      {list.error && <ErrorBanner message={list.error} onRetry={list.reload} />}
      {list.data && (
        <KpiRow
          items={[
            { label: "Tài khoản giáo viên", value: all.length },
            { label: "Đang hoạt động", value: count("ACTIVE") },
            { label: "Chưa được phân lớp", value: unassigned },
            { label: "Đã vô hiệu hóa", value: count("DISABLED") },
          ]}
        />
      )}

      <Panel title="Tài khoản giáo viên" description="Tạo tài khoản kèm mật khẩu tạm, sửa thông tin, đặt lại mật khẩu hoặc vô hiệu hóa khi giáo viên nghỉ.">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <StatusFilter
            value={filter}
            onChange={setFilter}
            options={[
              { value: "ALL", label: "Tất cả", count: count("ALL") },
              { value: "ACTIVE", label: "Đang hoạt động", count: count("ACTIVE") },
              { value: "DISABLED", label: "Đã vô hiệu hóa", count: count("DISABLED") },
            ]}
          />
          <SearchBox id="teacher-search" label="Tìm giáo viên" placeholder="Tên hoặc email…" value={search} onChange={setSearch} />
        </div>

        {list.loading && !list.data && <p role="status" className="py-6 text-sm text-ink-soft">Đang tải danh sách giáo viên…</p>}
        {list.data && shown.length === 0 && (
          <div className="rounded-lg border border-dashed border-line px-4 py-10 text-center">
            <p className="text-sm font-semibold">{all.length ? "Không có giáo viên phù hợp" : "Chưa có giáo viên nào"}</p>
            <p className="mt-1 text-sm text-ink-soft">{all.length ? "Thử bỏ lọc hoặc tìm tên khác." : "Thêm tài khoản để phân công giáo viên vào lớp."}</p>
          </div>
        )}

        {shown.length > 0 && (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="border-b border-line text-ink-soft">
                  <tr>
                    <th className="w-[32%] px-3 py-2 font-medium">Giáo viên</th>
                    <th className="w-[22%] px-3 py-2 font-medium">Lớp phụ trách</th>
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
                            <p className="max-w-[260px] truncate text-xs text-ink-soft" title={account.email}>{account.email}</p>
                            {(account.specialization || account.phone) && (
                              <p className="text-xs text-ink-soft">{[account.specialization, account.phone].filter(Boolean).join(" · ")}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3"><ClassChips classes={activeClasses(account)} /></td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <p>{lastSeenLabel(account.lastLoginAt, now)}</p>
                        <p className="text-xs tabular-nums text-ink-soft">Tạo {new Date(account.createdAt).toLocaleDateString("vi-VN")}</p>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3"><AccountStatusPill status={account.status} /></td>
                      <td className="px-3 py-3"><TeacherActions account={account} onPick={(kind) => setDialog({ kind, account })} /></td>
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
                      <p className="mt-0.5 text-xs text-ink-soft">Đăng nhập: {lastSeenLabel(account.lastLoginAt, now).toLowerCase()}</p>
                    </div>
                    <AccountStatusPill status={account.status} />
                  </div>
                  <div className="mt-3 pl-11"><ClassChips classes={activeClasses(account)} /></div>
                  <div className="mt-3 pl-11"><TeacherActions account={account} onPick={(kind) => setDialog({ kind, account })} /></div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>

      {dialog?.kind === "create" && (
        <TeacherForm
          admin={admin}
          onClose={() => setDialog(null)}
          onCreated={(result) => {
            setDialog(null);
            if (list.data) list.replace([...list.data, result.account].sort((a, b) => a.fullName.localeCompare(b.fullName, "vi")));
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
      {dialog?.kind === "status" && (
        <AccountStatusDialog
          name={dialog.account.fullName}
          email={dialog.account.email}
          activate={dialog.account.status === "DISABLED"}
          consequences={
            dialog.account.status === "DISABLED"
              ? ["Giáo viên đăng nhập lại được bằng mật khẩu hiện tại.", "Phân công lớp vẫn như trước khi vô hiệu hóa."]
              : [
                  "Giáo viên bị đăng xuất ngay trên mọi thiết bị và không đăng nhập được nữa.",
                  "Lớp, bài đã giao, giáo án và trò chơi đã lưu được giữ nguyên.",
                  activeClasses(dialog.account).length
                    ? `Giáo viên vẫn có tên trong ${activeClasses(dialog.account).length} lớp. Hãy phân công giáo viên khác nếu lớp cần người phụ trách.`
                    : "Giáo viên không phụ trách lớp nào.",
                  "Có thể kích hoạt lại bất cứ lúc nào.",
                ]
          }
          onConfirm={async () => replace(await admin.updateTeacher(dialog.account.userId, { status: dialog.account.status === "DISABLED" ? "ACTIVE" : "DISABLED" }))}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "reset" && (
        <ResetPasswordDialog
          name={dialog.account.fullName}
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            const result = await admin.resetPassword(dialog.account.userId);
            replace(result.account);
            setDialog(null);
            setIssued({ result, reason: "reset" });
          }}
        />
      )}
      {issued && <PasswordDialog issued={issued.result} reason={issued.reason} onClose={() => setIssued(null)} />}
    </ClassroomShell>
  );
}

function ClassChips({ classes }: { classes: TeacherAccount["classes"] }) {
  if (classes.length === 0) return <span className="text-xs text-ink-soft">Chưa phân lớp</span>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {classes.map((item) => (
        <li key={item.classId}>
          <Link
            href={`/admin/classrooms/${item.classId}`}
            className="inline-flex min-h-6 items-center whitespace-nowrap rounded border border-line px-1.5 text-xs text-leaf hover:bg-leaf-soft"
          >
            {item.className}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function TeacherActions({ account, onPick }: { account: TeacherAccount; onPick: (kind: "edit" | "status" | "reset") => void }) {
  const active = account.status === "ACTIVE";
  return (
    <div className="flex flex-wrap gap-2 md:flex-nowrap md:justify-end">
      <button type="button" className="asset-button-secondary whitespace-nowrap" onClick={() => onPick("edit")}>Sửa</button>
      {active && (
        <button type="button" className="asset-button-secondary whitespace-nowrap" onClick={() => onPick("reset")}>Đặt lại mật khẩu</button>
      )}
      <button
        type="button"
        className={`whitespace-nowrap ${active ? "asset-button-secondary text-berry" : "asset-button-primary"}`}
        onClick={() => onPick("status")}
      >
        {active ? "Vô hiệu hóa" : "Kích hoạt lại"}
      </button>
    </div>
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
  const [specialization, setSpecialization] = useState(account?.specialization ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const profile = { fullName: fullName.trim(), phone: phone.trim(), specialization: specialization.trim() };
      if (account) onSaved?.(await admin.updateTeacher(account.userId, profile));
      else onCreated?.(await admin.createTeacher({ ...profile, email: email.trim() }));
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
        <div>
          <label className="asset-label" htmlFor="teacher-specialization">Chuyên môn (không bắt buộc)</label>
          <input id="teacher-specialization" className="asset-input mt-1" maxLength={200} autoComplete="off" placeholder="Giáo dục mầm non" value={specialization} onChange={(event) => setSpecialization(event.target.value)} />
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

/** Shows a temporary password once (teacher or guardian account). */
export function PasswordDialog({
  issued,
  reason,
  onClose,
}: {
  issued: { account: { fullName: string; email: string }; temporaryPassword: string };
  reason: "created" | "reset";
  onClose: () => void;
}) {
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
