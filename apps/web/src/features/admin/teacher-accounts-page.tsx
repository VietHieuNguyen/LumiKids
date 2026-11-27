"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { BulkAccountStatusResult, IssuedPassword, TeacherAccount } from "@lumikids/shared";
import { classroomError } from "../classrooms/api";
import type { ClassroomApi } from "../classrooms/api";
import { ClassroomShell, Dialog, ErrorBanner, Notice, Panel } from "../classrooms/classroom-shell";
import { useClassroomSession } from "../classrooms/use-classroom-session";
import { useResource } from "../classrooms/use-resource";
import { AdminApi } from "./api";
import { lastSeenLabel } from "./format";
import {
  AccountStatusDialog,
  AccountStatusPill,
  BulkStatusDialog,
  DetailDrawer,
  DetailRows,
  DetailSection,
  Initial,
  KpiRow,
  ResetPasswordDialog,
  SearchBox,
  StatusFilter,
  openOnRowClick,
} from "./account-ui";
import {
  EmptyState,
  FilterSelect,
  Pagination,
  ResultCount,
  SelectBox,
  SelectionBar,
  SortHeader,
  SortSelect,
  Toolbar,
  compareName,
  pageOf,
  pageSizeOf,
  sortRows,
  textMatches,
  useCrossPageSelection,
  useListState,
} from "./data-table";
import type { SortDir } from "./data-table";

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
  const view = useListState({ q: "", status: "", classes: "", sort: "name", dir: "asc", page: "1", size: "25" });
  const { state } = view;
  const [dialog, setDialog] = useState<{ kind: "create" } | { kind: "edit" | "status" | "reset"; account: TeacherAccount } | null>(null);
  const [issued, setIssued] = useState<{ result: IssuedPassword; reason: "created" | "reset" } | null>(null);
  const [now] = useState(() => new Date());

  const all = list.data ?? [];
  const count = (status: string) => (status ? all.filter((account) => account.status === status).length : all.length);
  const activeClassCount = (account: TeacherAccount) => account.classes.filter((item) => item.status === "ACTIVE").length;
  const sortDir: SortDir = state.dir === "desc" ? "desc" : "asc";
  const compare: Record<string, (a: TeacherAccount, b: TeacherAccount) => number> = {
    name: (a, b) => compareName(a.fullName, b.fullName),
    classes: (a, b) => activeClassCount(a) - activeClassCount(b) || compareName(a.fullName, b.fullName),
    // Never signed in sorts first in ascending order.
    lastLogin: (a, b) => (a.lastLoginAt ?? "").localeCompare(b.lastLoginAt ?? "") || compareName(a.fullName, b.fullName),
  };
  const shown = sortRows(
    all.filter(
      (account) =>
        (!state.status || account.status === state.status) &&
        (state.classes !== "NONE" || activeClassCount(account) === 0) &&
        (state.classes !== "HAS" || activeClassCount(account) > 0) &&
        textMatches(state.q, account.fullName, account.email, account.specialization),
    ),
    compare[state.sort] ?? compare.name,
    sortDir,
  );
  const paged = pageOf(shown, Number(state.page) || 1, pageSizeOf(state.size));
  const onSort = (sort: string, dir: SortDir) => view.update({ sort, dir });
  const replace = (account: TeacherAccount) => {
    if (list.data) list.replace(list.data.map((item) => (item.userId === account.userId ? account : item)));
  };
  const activeClasses = (account: TeacherAccount) => account.classes.filter((item) => item.status === "ACTIVE");
  const unassigned = all.filter((account) => account.status === "ACTIVE" && activeClasses(account).length === 0).length;
  const selection = useCrossPageSelection(paged.rows.map((account) => account.userId), shown.map((account) => account.userId));
  const [detailId, setDetailId] = useState<string | null>(null);
  const [bulk, setBulk] = useState<"ACTIVE" | "DISABLED" | null>(null);
  const detail = all.find((account) => account.userId === detailId) ?? null;
  const [lockError, setLockError] = useState("");
  const pick = (account: TeacherAccount) => (kind: "edit" | "status" | "reset" | "unlock") => {
    if (kind === "unlock") return void unlock(account);
    setDialog({ kind, account });
  };
  const unlock = async (account: TeacherAccount) => {
    try {
      replace(await admin.unlockTeacher(account.userId));
    } catch (failure) {
      setLockError(classroomError(failure));
    }
  };

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
            value={state.status}
            onChange={(status) => view.update({ status })}
            options={[
              { value: "", label: "Tất cả", count: count("") },
              { value: "ACTIVE", label: "Đang hoạt động", count: count("ACTIVE") },
              { value: "DISABLED", label: "Đã vô hiệu hóa", count: count("DISABLED") },
            ]}
          />
        </div>
        <Toolbar>
          <SearchBox id="teacher-search" label="Tìm giáo viên" placeholder="Tên, email hoặc chuyên môn…" value={state.q} onChange={(q) => view.update({ q })} />
          <FilterSelect
            id="teacher-classes"
            label="Phân lớp"
            value={state.classes}
            onChange={(classes) => view.update({ classes })}
            options={[
              { value: "", label: "Tất cả" },
              { value: "HAS", label: "Đang phụ trách lớp" },
              { value: "NONE", label: "Chưa được phân lớp" },
            ]}
          />
          <SortSelect
            id="teacher-sort"
            sort={state.sort}
            dir={sortDir}
            onSort={onSort}
            options={[
              { field: "name", label: "Tên" },
              { field: "classes", label: "Số lớp" },
              { field: "lastLogin", label: "Đăng nhập gần nhất" },
            ]}
          />
        </Toolbar>
        {list.data && (
          <div className="mb-3">
            <ResultCount shown={shown.length} total={all.length} noun="giáo viên" changed={view.changed} onReset={view.reset} />
          </div>
        )}

        {list.loading && !list.data && <p role="status" className="py-6 text-sm text-ink-soft">Đang tải danh sách giáo viên…</p>}
        {list.data && shown.length === 0 && (
          <EmptyState filtered={all.length > 0} title="Chưa có giáo viên nào" hint="Thêm tài khoản để phân công giáo viên vào lớp." onReset={view.reset} />
        )}

        <SelectionBar selection={selection} noun="giáo viên">
          <button type="button" className="asset-button-secondary text-berry" onClick={() => setBulk("DISABLED")}>Vô hiệu hóa</button>
          <button type="button" className="asset-button-secondary" onClick={() => setBulk("ACTIVE")}>Kích hoạt lại</button>
        </SelectionBar>
        {shown.length > 0 && (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="border-b border-line bg-cream/60 text-ink-soft">
                  <tr>
                    <th className="w-10 py-2 pl-3 pr-0">
                      <span className="flex h-8 items-center">
                        <SelectBox checked={selection.allOnPage} mixed={selection.someOnPage} onChange={selection.togglePage} label="Chọn tất cả giáo viên trên trang này" />
                      </span>
                    </th>
                    <SortHeader label="Giáo viên" field="name" sort={state.sort} dir={sortDir} onSort={onSort} className="w-[32%]" />
                    <SortHeader label="Lớp phụ trách" field="classes" sort={state.sort} dir={sortDir} onSort={onSort} className="w-[22%]" />
                    <SortHeader label="Hoạt động" field="lastLogin" sort={state.sort} dir={sortDir} onSort={onSort} className="whitespace-nowrap" />
                    <th className="px-3 py-2 font-medium">Trạng thái</th>
                    <th className="px-3 py-2 text-right font-medium"><span className="sr-only">Thao tác</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {paged.rows.map((account) => (
                    <tr
                      key={account.userId}
                      onClick={openOnRowClick(() => setDetailId(account.userId)).onClick}
                      className={`align-top ${openOnRowClick(() => undefined).className} ${account.status === "DISABLED" ? "text-ink-soft" : ""} ${selection.has(account.userId) ? "bg-leaf-soft/40" : ""}`}
                    >
                      <td className="py-3 pl-3 pr-0 align-top">
                        <span className="flex h-8 items-center">
                          <SelectBox checked={selection.has(account.userId)} onChange={() => selection.toggle(account.userId)} label={`Chọn ${account.fullName}`} />
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-start gap-3">
                          <Initial name={account.fullName} muted={account.status !== "ACTIVE"} />
                          <div className="min-w-0">
                            <button type="button" className="break-words text-left font-semibold text-ink hover:text-leaf hover:underline" onClick={() => setDetailId(account.userId)}>{account.fullName}</button>
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
                      <td className="px-3 py-3"><TeacherActions account={account} onPick={pick(account)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mb-2 flex items-center gap-2 md:hidden">
              <SelectBox checked={selection.allOnPage} mixed={selection.someOnPage} onChange={selection.togglePage} label="Chọn tất cả giáo viên trên trang này" />
              <span className="text-[13px] text-ink-soft">Chọn cả trang</span>
            </div>
            <ul className="divide-y divide-line md:hidden">
              {paged.rows.map((account) => (
                <li key={account.userId} className="py-4 first:pt-0">
                  <div className="flex items-start gap-3">
                    <span className="flex h-8 items-center">
                      <SelectBox checked={selection.has(account.userId)} onChange={() => selection.toggle(account.userId)} label={`Chọn ${account.fullName}`} />
                    </span>
                    <Initial name={account.fullName} muted={account.status !== "ACTIVE"} />
                    <div className="min-w-0 flex-1">
                      <button type="button" className="break-words text-left font-semibold hover:text-leaf hover:underline" onClick={() => setDetailId(account.userId)}>{account.fullName}</button>
                      <p className="truncate text-xs text-ink-soft" title={account.email}>{account.email}</p>
                      <p className="mt-0.5 text-xs text-ink-soft">Đăng nhập: {lastSeenLabel(account.lastLoginAt, now).toLowerCase()}</p>
                    </div>
                    <AccountStatusPill status={account.status} />
                  </div>
                  <div className="mt-3 pl-[4.25rem]"><ClassChips classes={activeClasses(account)} /></div>
                  <div className="mt-3 pl-[4.25rem]"><TeacherActions account={account} onPick={pick(account)} /></div>
                </li>
              ))}
            </ul>
          </>
        )}
        <Pagination page={paged.page} pages={paged.pages} total={shown.length} size={pageSizeOf(state.size)} onPage={(page) => view.update({ page: String(page) })} onSize={(size) => view.update({ size: String(size) })} />
      </Panel>

      {detail && (
        <TeacherDrawer
          key={`${detail.userId}:${detail.status}:${detail.fullName}:${detail.phone}:${detail.specialization}`}
          admin={admin}
          account={detail}
          now={now}
          onPick={pick(detail)}
          onClose={() => setDetailId(null)}
        />
      )}
      {bulk && (
        <BulkStatusDialog
          names={new Map(all.filter((account) => selection.selected.includes(account.userId)).map((account) => [account.userId, account.fullName]))}
          activate={bulk === "ACTIVE"}
          consequences={
            bulk === "ACTIVE"
              ? ["Giáo viên đăng nhập lại được bằng mật khẩu hiện tại.", "Phân công lớp vẫn như trước khi vô hiệu hóa."]
              : [
                  "Mọi giáo viên đã chọn bị đăng xuất ngay trên mọi thiết bị.",
                  "Lớp, bài đã giao, giáo án và trò chơi đã lưu được giữ nguyên.",
                  "Lớp do các giáo viên này phụ trách vẫn giữ tên họ; hãy phân công người khác nếu cần.",
                ]
          }
          onConfirm={async () => {
            // The API takes 100 accounts per call.
            const merged: BulkAccountStatusResult = { updated: [], skipped: [] };
            for (let start = 0; start < selection.selected.length; start += 100) {
              const result = await admin.bulkTeacherStatus({ userIds: selection.selected.slice(start, start + 100), status: bulk });
              merged.updated.push(...result.updated);
              merged.skipped.push(...result.skipped);
            }
            list.reload();
            return merged;
          }}
          onClose={() => {
            setBulk(null);
            selection.clear();
          }}
        />
      )}
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
      {lockError && <p role="alert" className="asset-error">{lockError}</p>}
      {issued && <PasswordDialog issued={issued.result} reason={issued.reason} onClose={() => setIssued(null)} />}
    </ClassroomShell>
  );
}

function TeacherDrawer({
  admin,
  account,
  now,
  onPick,
  onClose,
}: {
  admin: AdminApi;
  account: TeacherAccount;
  now: Date;
  onPick: (kind: "edit" | "status" | "reset" | "unlock") => void;
  onClose: () => void;
}) {
  const detail = useResource((signal) => admin.teacherDetail(account.userId, signal), `teacher:${account.userId}`);
  const data = detail.data;
  const current = account.classes.filter((item) => item.status === "ACTIVE");
  const past = account.classes.filter((item) => item.status === "ARCHIVED");
  const classList = (classes: TeacherAccount["classes"]) => (
    <ul className="divide-y divide-line rounded-lg border border-line">
      {classes.map((item) => (
        <li key={item.classId} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
          <Link className="font-medium text-leaf hover:underline" href={`/admin/classrooms/${item.classId}`}>{item.className}</Link>
          <span className="text-ink-soft">Năm học {item.schoolYearName}</span>
        </li>
      ))}
    </ul>
  );
  return (
    <DetailDrawer title="Chi tiết giáo viên" onClose={onClose} footer={<TeacherActions account={account} onPick={onPick} />}>
      <div className="flex items-start gap-3">
        <Initial name={account.fullName} muted={account.status !== "ACTIVE"} />
        <div className="min-w-0 flex-1">
          <p className="break-words font-semibold">{account.fullName}</p>
          <p className="break-all text-xs text-ink-soft">{account.email}</p>
        </div>
        <AccountStatusPill status={account.status} />
      </div>
      <div className="mt-5">
        <DetailSection title="Liên hệ và chuyên môn">
          <DetailRows
            rows={[
              ["Điện thoại", account.phone || <span className="text-ink-soft">Chưa có</span>],
              ["Chuyên môn", account.specialization || <span className="text-ink-soft">Chưa có</span>],
              ["Tạo tài khoản", new Date(account.createdAt).toLocaleDateString("vi-VN")],
              ["Đăng nhập gần nhất", lastSeenLabel(account.lastLoginAt, now)],
              ["Thiết bị đang đăng nhập", data ? data.activeSessions : "…"],
            ]}
          />
        </DetailSection>
      </div>
      {detail.error && <div className="mt-4"><ErrorBanner message={detail.error} onRetry={detail.reload} /></div>}
      <DetailSection title="Công việc">
        <dl className="grid grid-cols-2 gap-2">
          {[
            ["Bài đã giao", data?.assignmentCount],
            ["Trò chơi đã lưu", data?.gameCount],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-line px-3 py-2">
              <dt className="text-xs text-ink-soft">{label}</dt>
              <dd className="text-xl font-semibold tabular-nums">{value ?? "…"}</dd>
            </div>
          ))}
        </dl>
      </DetailSection>
      <DetailSection title={`Lớp đang phụ trách (${current.length})`}>
        {current.length ? classList(current) : <p className="text-sm text-ink-soft">Chưa được phân lớp năm nay.</p>}
      </DetailSection>
      {past.length > 0 && <DetailSection title={`Lớp đã phụ trách (${past.length})`}>{classList(past)}</DetailSection>}
    </DetailDrawer>
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

function TeacherActions({ account, onPick }: { account: TeacherAccount; onPick: (kind: "edit" | "status" | "reset" | "unlock") => void }) {
  const active = account.status === "ACTIVE";
  const locked = account.lockedUntil !== null && new Date(account.lockedUntil) > new Date();
  return (
    <div className="flex flex-wrap gap-2 md:flex-nowrap md:justify-end">
      {locked && (
        <button type="button" className="asset-button-secondary whitespace-nowrap" onClick={() => onPick("unlock")}>Mở khóa đăng nhập</button>
      )}
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
