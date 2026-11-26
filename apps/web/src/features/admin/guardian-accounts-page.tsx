"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { BulkAccountStatusResult, ChildSharing, GuardianAccount, GuardianPick, IssuedGuardianPassword } from "@lumikids/shared";
import type { ClassroomApi } from "../classrooms/api";
import { ClassroomShell, ErrorBanner, Notice, Panel } from "../classrooms/classroom-shell";
import { useClassroomSession } from "../classrooms/use-classroom-session";
import { useResource } from "../classrooms/use-resource";
import { relationshipLabels } from "../family/api";
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
  pageSizeOf,
  toParams,
  useDebounced,
  useListState,
  useServerSelection,
} from "./data-table";
import type { SortDir } from "./data-table";
import { AdminApi } from "./api";
import { lastSeenLabel } from "./format";
import { PasswordDialog } from "./teacher-accounts-page";

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
  const list = useListState({ q: "", status: "", children: "", sort: "createdAt", dir: "desc", page: "1", size: "25" });
  const { state } = list;
  const [search, setSearch] = useState(state.q);
  const q = useDebounced(search.trim());
  useEffect(() => {
    if (q !== state.q) list.update({ q });
    // Only the settled text pushes into the list state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  const filter = { q: state.q, status: state.status, children: state.children };
  const filterKey = toParams(filter).toString();
  const params = toParams({ ...filter, sort: state.sort, dir: state.dir, page: state.page, pageSize: pageSizeOf(state.size) });
  const accounts = useResource((signal) => admin.guardians(params, signal), params.toString());
  const [pending, setPending] = useState<Pending>(null);
  const [issued, setIssued] = useState<IssuedGuardianPassword | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [bulk, setBulk] = useState<"ACTIVE" | "DISABLED" | null>(null);
  const [now] = useState(() => new Date());

  const rows = accounts.data?.items ?? [];
  const counts = accounts.data?.counts;
  const total = accounts.data?.total ?? 0;
  const page = Number(state.page) || 1;
  const pages = Math.max(1, Math.ceil(total / pageSizeOf(state.size)));
  useEffect(() => {
    if (accounts.data && !accounts.loading && page > pages) list.update({ page: String(pages) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.data, accounts.loading, page, pages]);
  const replace = (account: GuardianAccount) => {
    if (accounts.data) accounts.replace({ ...accounts.data, items: accounts.data.items.map((item) => (item.userId === account.userId ? account : item)) });
  };
  const selection = useServerSelection<GuardianPick>({
    idOf: (pick) => pick.userId,
    pageRows: rows.map((account) => ({ userId: account.userId, fullName: account.fullName, status: account.status })),
    total,
    resetKey: filterKey,
    loadAll: () => admin.guardianIds(toParams(filter)),
  });
  const detail = rows.find((account) => account.userId === detailId) ?? null;
  const sortDir: SortDir = state.dir === "asc" ? "asc" : "desc";
  const onSort = (sort: string, dir: SortDir) => list.update({ sort, dir });
  const resetAll = () => {
    setSearch("");
    list.reset();
  };

  return (
    <ClassroomShell title="Phụ huynh" eyebrow="Quản trị">
      {accounts.error && <ErrorBanner message={accounts.error} onRetry={accounts.reload} />}
      {counts && (
        <KpiRow
          items={[
            { label: "Tài khoản phụ huynh", value: counts.all },
            { label: "Đang hoạt động", value: counts.active },
            { label: "Chờ xác minh email", value: counts.pending },
            { label: "Hồ sơ trẻ", value: counts.children, hint: `${counts.unplacedChildren} trẻ chưa có lớp` },
          ]}
        />
      )}

      <Panel title="Tài khoản phụ huynh" description="Phụ huynh tự đăng ký và xác minh bằng email. Quản trị viên có thể vô hiệu hóa, kích hoạt lại hoặc đặt lại mật khẩu.">
        <div className="mb-3">
          <StatusFilter
            value={state.status}
            onChange={(status) => list.update({ status })}
            options={[
              { value: "", label: "Tất cả", count: counts?.all ?? 0 },
              { value: "ACTIVE", label: "Đang hoạt động", count: counts?.active ?? 0 },
              { value: "PENDING_VERIFICATION", label: "Chờ xác minh", count: counts?.pending ?? 0 },
              { value: "DISABLED", label: "Đã vô hiệu hóa", count: counts?.disabled ?? 0 },
            ]}
          />
        </div>
        <Toolbar>
          <SearchBox id="guardian-search" label="Tìm phụ huynh" placeholder="Tên, email hoặc tên con…" value={search} onChange={setSearch} />
          <FilterSelect
            id="guardian-children"
            label="Hồ sơ con"
            value={state.children}
            onChange={(children) => list.update({ children })}
            options={[
              { value: "", label: "Tất cả" },
              { value: "UNPLACED", label: "Có con chưa vào lớp" },
              { value: "NONE", label: "Chưa thêm hồ sơ con" },
            ]}
          />
          <SortSelect
            id="guardian-sort"
            sort={state.sort}
            dir={sortDir}
            onSort={onSort}
            options={[
              { field: "createdAt", label: "Ngày đăng ký" },
              { field: "name", label: "Họ tên" },
            ]}
          />
        </Toolbar>
        <div className="mb-3 flex items-center justify-between gap-3">
          {accounts.data && <ResultCount shown={total} total={counts?.all ?? total} noun="phụ huynh" changed={list.changed} onReset={resetAll} />}
          {accounts.loading && accounts.data && <p role="status" className="text-[13px] text-ink-soft">Đang tải…</p>}
        </div>

        {!accounts.data && !accounts.error && <p role="status" className="py-6 text-sm text-ink-soft">Đang tải danh sách phụ huynh…</p>}
        {accounts.data && rows.length === 0 && !accounts.loading && (
          <EmptyState filtered={list.changed > 0} title="Chưa có phụ huynh nào" hint="Phụ huynh tự đăng ký ở trang Đăng ký." onReset={resetAll} />
        )}

        <SelectionBar selection={selection} noun="phụ huynh">
          <button type="button" className="asset-button-secondary text-berry" onClick={() => setBulk("DISABLED")}>Vô hiệu hóa</button>
          <button type="button" className="asset-button-secondary" onClick={() => setBulk("ACTIVE")}>Kích hoạt lại</button>
        </SelectionBar>
        {rows.length > 0 && (
          <div className={accounts.loading ? "opacity-60 transition-opacity" : "transition-opacity"} aria-busy={accounts.loading}>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="border-b border-line bg-cream/60 text-ink-soft">
                  <tr>
                    <th scope="col" className="w-10 py-2 pl-3 pr-0">
                      <span className="flex h-8 items-center">
                        <SelectBox checked={selection.allOnPage} mixed={selection.someOnPage} onChange={selection.togglePage} label="Chọn tất cả phụ huynh trên trang này" />
                      </span>
                    </th>
                    <SortHeader label="Phụ huynh" field="name" sort={state.sort} dir={sortDir} onSort={onSort} className="w-[30%]" />
                    <th scope="col" className="w-[28%] px-3 py-2 font-medium">Con</th>
                    <SortHeader label="Đăng ký" field="createdAt" sort={state.sort} dir={sortDir} onSort={onSort} className="whitespace-nowrap" />
                    <th scope="col" className="px-3 py-2 font-medium">Trạng thái</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium"><span className="sr-only">Thao tác</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((account) => (
                    <tr
                      key={account.userId}
                      onClick={openOnRowClick(() => setDetailId(account.userId)).onClick}
                      className={`align-top ${openOnRowClick(() => undefined).className} ${account.status === "DISABLED" ? "text-ink-soft" : ""} ${selection.has(account.userId) ? "bg-leaf-soft/40" : ""}`}
                    >
                      <td className="py-3 pl-3 pr-0 align-top">
                        <span className="flex h-8 items-center">
                          <SelectBox checked={selection.has(account.userId)} onChange={() => selection.toggle({ userId: account.userId, fullName: account.fullName, status: account.status })} label={`Chọn ${account.fullName}`} />
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-start gap-3">
                          <Initial name={account.fullName} muted={account.status !== "ACTIVE"} />
                          <div className="min-w-0">
                            <button type="button" className="break-words text-left font-semibold text-ink hover:text-leaf hover:underline" onClick={() => setDetailId(account.userId)}>{account.fullName}</button>
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
                        <p className="tabular-nums">{dateLabel(account.createdAt)}</p>
                        <p className="text-xs text-ink-soft">Đăng nhập: {lastSeenLabel(account.lastLoginAt, now).toLowerCase()}</p>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3"><AccountStatusPill status={account.status} /></td>
                      <td className="px-3 py-3"><RowActions account={account} onPick={setPending} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mb-2 flex items-center gap-2 md:hidden">
              <SelectBox checked={selection.allOnPage} mixed={selection.someOnPage} onChange={selection.togglePage} label="Chọn tất cả phụ huynh trên trang này" />
              <span className="text-[13px] text-ink-soft">Chọn cả trang</span>
            </div>
            <ul className="divide-y divide-line md:hidden">
              {rows.map((account) => (
                <li key={account.userId} className="py-4">
                  <div className="flex items-start gap-3">
                    <SelectBox checked={selection.has(account.userId)} onChange={() => selection.toggle({ userId: account.userId, fullName: account.fullName, status: account.status })} label={`Chọn ${account.fullName}`} />
                    <Initial name={account.fullName} muted={account.status !== "ACTIVE"} />
                    <div className="min-w-0 flex-1">
                      <button type="button" className="break-words text-left font-semibold hover:text-leaf hover:underline" onClick={() => setDetailId(account.userId)}>{account.fullName}</button>
                      <p className="truncate text-xs text-ink-soft" title={account.email}>{account.email}</p>
                      <p className="mt-0.5 text-xs text-ink-soft">
                        {relationshipLabels[account.relationship]} · Đăng nhập: {lastSeenLabel(account.lastLoginAt, now).toLowerCase()}
                      </p>
                    </div>
                    <AccountStatusPill status={account.status} />
                  </div>
                  <div className="mt-3 pl-[6.5rem]"><ChildrenList account={account} now={now} /></div>
                  <div className="mt-3 pl-[6.5rem]"><RowActions account={account} onPick={setPending} /></div>
                </li>
              ))}
            </ul>
          </div>
        )}
        <Pagination page={Math.min(page, pages)} pages={pages} total={total} size={pageSizeOf(state.size)} onPage={(value) => list.update({ page: String(value) })} onSize={(value) => list.update({ size: String(value) })} />
      </Panel>

      {detail && (
        <GuardianDrawer
          key={`${detail.userId}:${detail.status}`}
          admin={admin}
          account={detail}
          now={now}
          onPick={setPending}
          onClose={() => setDetailId(null)}
        />
      )}
      {bulk && (
        <BulkStatusDialog
          names={new Map(selection.selected.map((pick) => [pick.userId, pick.fullName]))}
          activate={bulk === "ACTIVE"}
          consequences={
            bulk === "ACTIVE"
              ? ["Phụ huynh đăng nhập lại được bằng mật khẩu hiện tại.", "Tài khoản chưa xác minh email và tài khoản đã đang hoạt động được bỏ qua."]
              : [
                  "Mọi phụ huynh đã chọn bị đăng xuất ngay trên mọi thiết bị.",
                  "Hồ sơ con, lớp và lịch sử chơi được giữ nguyên; mã đăng nhập của trẻ vẫn dùng được.",
                  "Tài khoản chưa xác minh email được bỏ qua và báo lại sau khi xong.",
                ]
          }
          onConfirm={async () => {
            // The API takes 100 accounts per call; a larger selection goes in turns.
            const ids = selection.selectedIds;
            const merged: BulkAccountStatusResult = { updated: [], skipped: [] };
            for (let start = 0; start < ids.length; start += 100) {
              const result = await admin.bulkGuardianStatus({ userIds: ids.slice(start, start + 100), status: bulk });
              merged.updated.push(...result.updated);
              merged.skipped.push(...result.skipped);
            }
            accounts.reload();
            return merged;
          }}
          onClose={() => {
            setBulk(null);
            selection.clear();
          }}
        />
      )}
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

const sharingView: Record<ChildSharing, string> = {
  CONSENTED: "Chia sẻ kết quả chơi với lớp",
  SCHOOL_ENROLLED: "Trường xếp lớp (không qua yêu cầu của phụ huynh)",
  PENDING_REQUEST: "Đang chờ cô duyệt vào lớp",
  HOME: "Chưa vào lớp, chỉ chơi ở nhà",
};

function GuardianDrawer({
  admin,
  account,
  now,
  onPick,
  onClose,
}: {
  admin: AdminApi;
  account: GuardianAccount;
  now: Date;
  onPick: (pending: Pending) => void;
  onClose: () => void;
}) {
  const detail = useResource((signal) => admin.guardianDetail(account.userId, signal), `guardian:${account.userId}`);
  const data = detail.data;
  return (
    <DetailDrawer
      title="Chi tiết phụ huynh"
      onClose={onClose}
      footer={account.status === "PENDING_VERIFICATION" ? undefined : <RowActions account={account} onPick={onPick} />}
    >
      <div className="flex items-start gap-3">
        <Initial name={account.fullName} muted={account.status !== "ACTIVE"} />
        <div className="min-w-0 flex-1">
          <p className="break-words font-semibold">{account.fullName}</p>
          <p className="break-all text-xs text-ink-soft">{account.email}</p>
        </div>
        <AccountStatusPill status={account.status} />
      </div>
      {detail.error && <div className="mt-4"><ErrorBanner message={detail.error} onRetry={detail.reload} /></div>}
      {!data && !detail.error && <p role="status" className="mt-4 text-sm text-ink-soft">Đang tải chi tiết…</p>}
      {data && (
        <>
          <div className="mt-5">
            <DetailSection title="Thông tin">
              <DetailRows
                rows={[
                  ["Quan hệ với trẻ", relationshipLabels[data.relationship]],
                  ["Điện thoại", data.phone || <span className="text-ink-soft">Chưa có</span>],
                  ["Đăng ký", dateLabel(data.createdAt)],
                  ["Email", data.status === "PENDING_VERIFICATION" ? <span className="font-medium">Chưa xác minh</span> : "Đã xác minh"],
                  ["Đăng nhập gần nhất", lastSeenLabel(data.lastLoginAt, now)],
                  ["Thiết bị đang đăng nhập", data.activeSessions],
                ]}
              />
            </DetailSection>
          </div>
          <DetailSection title={`Con (${data.children.length})`}>
            {data.children.length === 0 ? (
              <p className="text-sm text-ink-soft">Chưa thêm hồ sơ con.</p>
            ) : (
              <ul className="space-y-2">
                {data.children.map((child) => (
                  <li key={child.childId} className="rounded-lg border border-line px-3 py-2.5 text-[13px]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold">
                        {child.fullName} <span className="font-normal text-ink-soft">· {ageLabel(child.dob, now)}</span>
                      </p>
                      {child.classroom ? (
                        <Link
                          href={`/admin/classrooms/${child.classroom.classId}/children/${child.childId}`}
                          className="inline-flex min-h-6 items-center whitespace-nowrap rounded border border-line px-1.5 text-xs text-leaf hover:bg-leaf-soft"
                        >
                          Lớp {child.classroom.className}
                        </Link>
                      ) : (
                        <span className="inline-flex min-h-6 items-center rounded bg-cream px-1.5 text-xs text-ink-soft">Học tại nhà</span>
                      )}
                    </div>
                    <p className="mt-1 text-ink-soft">
                      {sharingView[child.sharing]}
                      {child.sharing === "CONSENTED" && child.consentGrantedAt && ` từ ${dateLabel(child.consentGrantedAt)}`}
                      {child.sharing === "PENDING_REQUEST" && child.pendingClassName && ` ${child.pendingClassName}`}
                    </p>
                    <p className="text-ink-soft">Lần chơi gần nhất: {child.lastPlayedAt ? lastSeenLabel(child.lastPlayedAt, now).toLowerCase() : "chưa chơi"}</p>
                  </li>
                ))}
              </ul>
            )}
          </DetailSection>
          {data.status === "PENDING_VERIFICATION" && (
            <p className="mt-5 rounded-lg bg-cream px-3 py-2.5 text-[13px] leading-5 text-ink-soft">
              Phụ huynh chưa nhập mã xác minh email nên chưa có thao tác nào. Tài khoản sẽ hoạt động khi phụ huynh tự xác minh.
            </p>
          )}
        </>
      )}
    </DetailDrawer>
  );
}
