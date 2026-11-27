"use client";
import Link from "next/link";
import { useState } from "react";
import type { ClassInvite, ClassJoinRequest, IssuedClassInvite } from "@lumikids/shared";
import { classroomError } from "./api";
import type { ClassroomApi } from "./api";
import { Dialog, ErrorBanner, Panel, StatusPill } from "./classroom-shell";
import { formatDateOnly, formatDateTime, genderLabels } from "./format";
import { useResource } from "./use-resource";
import { BatchOutcome, ClassroomBatchDialog } from "./classroom-batch-dialog";
import type { BatchPerson } from "./classroom-batch-dialog";

const relationshipLabels = { MOTHER: "Mẹ", FATHER: "Bố", GRANDPARENT: "Ông/Bà", OTHER: "Người giám hộ" } as const;
const inviteStates = {
  ACTIVE: { label: "Đang dùng được", tone: "green" },
  EXPIRED: { label: "Hết hạn", tone: "slate" },
  REVOKED: { label: "Đã thu hồi", tone: "slate" },
  USED_UP: { label: "Đã dùng hết", tone: "amber" },
} as const;

/** Link a guardian opens; the code is also typed by hand from a printed note. */
function inviteLink(code: string) {
  return `${window.location.origin}/family/join?code=${encodeURIComponent(code)}`;
}

/** Teacher tab: invitation links for guardians and the join requests waiting for a decision (FR-1.8). */
export function FamilyRequestsPanel({ api, classId, className, canEdit }: { api: ClassroomApi; classId: string; className: string; canEdit: boolean }) {
  const requests = useResource((signal) => api.joinRequests(classId, signal), `requests:${classId}`);
  const invites = useResource((signal) => api.invites(classId, signal), `invites:${classId}`);
  const [creating, setCreating] = useState(false);
  const [batch, setBatch] = useState<BatchPerson[] | null>(null);
  const pending = requests.data?.filter((request) => request.status === "PENDING") ?? [];
  const batchEligible = pending.filter((request) => request.ageMatches);
  const decided = requests.data?.filter((request) => request.status !== "PENDING") ?? [];
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-6">
        <Panel
          title="Yêu cầu vào lớp"
          description="Phụ huynh dùng lời mời để xin cho con vào lớp. Duyệt thì trẻ vào lớp ngay và lớp được xem kết quả chơi theo phần phụ huynh đã đồng ý."
          actions={pending.length ? (
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone="amber">{pending.length} chờ duyệt</StatusPill>
              {canEdit && batchEligible.length > 0 && <button type="button" className="asset-button-primary" onClick={() => setBatch(batchEligible.map((request) => ({
                id: request.requestId,
                name: request.childName,
                detail: `${formatDateOnly(request.dob)} · ${relationshipLabels[request.relationship]} ${request.guardianName}`,
              })))}>Duyệt hàng loạt</button>}
            </div>
          ) : undefined}
        >
          {requests.error && <ErrorBanner message={requests.error} onRetry={requests.reload} />}
          {requests.loading && !requests.data && <p role="status" className="text-sm text-ink-soft">Đang tải yêu cầu…</p>}
          {requests.data && pending.length === 0 && <p className="text-sm text-ink-soft">Không có yêu cầu nào đang chờ.</p>}
          {pending.length > 0 && (
            <ul className="space-y-3">
              {pending.map((request) => (
                <JoinRequestRow key={request.requestId} api={api} classId={classId} request={request} canEdit={canEdit} onDecided={requests.reload} />
              ))}
            </ul>
          )}
          {decided.length > 0 && (
            <details className="mt-5 rounded-2xl border border-line bg-white p-3">
              <summary className="cursor-pointer text-sm font-semibold text-ink">Đã xử lý ({decided.length})</summary>
              <ul className="mt-3 divide-y divide-line text-sm">
                {decided.map((request) => (
                  <li key={request.requestId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="min-w-0 break-words">
                      <strong className="font-semibold">{request.childName}</strong>
                      <span className="text-ink-soft"> · {relationshipLabels[request.relationship]} {request.guardianName}</span>
                    </span>
                    <span className="flex items-center gap-2 text-xs text-ink-soft">
                      {request.decidedAt && formatDateTime(request.decidedAt)}
                      <StatusPill tone={request.status === "APPROVED" ? "green" : "slate"}>{request.status === "APPROVED" ? "Đã duyệt" : "Đã từ chối"}</StatusPill>
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Panel>
      </div>
      <aside className="space-y-6">
        <Panel
          title="Lời mời phụ huynh"
          description="Mỗi lời mời có hạn dùng và số lượt. Mã chỉ hiện một lần khi tạo."
          actions={canEdit ? <button type="button" className="asset-button-primary" onClick={() => setCreating(true)}>Tạo lời mời</button> : undefined}
        >
          {invites.error && <ErrorBanner message={invites.error} onRetry={invites.reload} />}
          {invites.data?.length === 0 && <p className="text-sm text-ink-soft">Chưa có lời mời nào.</p>}
          {invites.data && invites.data.length > 0 && (
            <ul className="space-y-2">
              {invites.data.map((invite) => (
                <InviteRow key={invite.inviteId} api={api} classId={classId} invite={invite} canEdit={canEdit} onChange={invites.reload} />
              ))}
            </ul>
          )}
        </Panel>
      </aside>
      {batch && <ClassroomBatchDialog
        title={`Duyệt yêu cầu vào lớp ${className}`}
        action="Duyệt"
        people={batch}
        description="Chọn các yêu cầu đúng nhóm tuổi đã được phụ huynh xác nhận. Yêu cầu khác nhóm tuổi được xem riêng."
        onClose={() => setBatch(null)}
        onConfirm={async (ids) => {
          const result = await api.approveJoinRequests(classId, ids);
          requests.reload();
          return result;
        }}
        resultView={(result) => (
          <>
            <BatchOutcome people={batch} completed={`Đã duyệt ${result.completedIds.length} yêu cầu`} skipped={result.skipped} />
            {result.completedIds.length > 0 && <Link href={`/teacher/classrooms/${classId}?tab=children`} onClick={() => setBatch(null)} className="asset-button-secondary mt-3">Mở danh sách trẻ</Link>}
          </>
        )}
      />}
      {creating && (
        <CreateInviteDialog
          api={api}
          classId={classId}
          className={className}
          onClose={() => setCreating(false)}
          onCreated={invites.reload}
        />
      )}
    </div>
  );
}

function JoinRequestRow({ api, classId, request, canEdit, onDecided }: { api: ClassroomApi; classId: string; request: ClassJoinRequest; canEdit: boolean; onDecided: () => void }) {
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState("");
  async function decide(approve: boolean) {
    if (busy) return;
    setBusy(approve ? "approve" : "reject");
    setError("");
    try {
      await api.decideJoinRequest(classId, request.requestId, approve);
      onDecided();
    } catch (failure) {
      setError(classroomError(failure));
    } finally {
      setBusy(null);
    }
  }
  return (
    <li className="rounded-2xl border border-line bg-white p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-sun-soft font-display text-lg font-bold ring-1 ring-sun-edge/40">
          {request.childName.trim().split(/\s+/).pop()?.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="break-words font-semibold text-ink">{request.childName}</p>
          <p className="text-xs leading-5 text-ink-soft">
            {genderLabels[request.gender]} · Sinh {formatDateOnly(request.dob)} · Gửi {formatDateTime(request.requestedAt)}
          </p>
          <p className="mt-1 break-words text-sm text-ink">
            {relationshipLabels[request.relationship]}: {request.guardianName} <span className="text-ink-soft">({request.guardianEmail})</span>
          </p>
          <p className="mt-1 text-xs text-ink-soft">Đã đồng ý chia sẻ hồ sơ, kết quả chơi và đánh giá với lớp ({request.consentVersion}).</p>
          {!request.ageMatches && <p className="mt-2"><StatusPill tone="amber">Tuổi của trẻ chưa đúng nhóm tuổi của lớp</StatusPill></p>}
        </div>
      </div>
      {error && <p role="alert" className="asset-error mt-3">{error}</p>}
      {canEdit && (
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <button type="button" className="asset-button-secondary" disabled={busy !== null} onClick={() => void decide(false)}>{busy === "reject" ? "Đang từ chối…" : "Từ chối"}</button>
          <button type="button" className="asset-button-primary" disabled={busy !== null} onClick={() => void decide(true)}>{busy === "approve" ? "Đang duyệt…" : "Duyệt vào lớp"}</button>
        </div>
      )}
    </li>
  );
}

function InviteRow({ api, classId, invite, canEdit, onChange }: { api: ClassroomApi; classId: string; invite: ClassInvite; canEdit: boolean; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const state = inviteStates[invite.state];
  async function revoke() {
    if (busy || !window.confirm("Thu hồi lời mời này? Mã và đường dẫn sẽ không dùng được nữa.")) return;
    setBusy(true);
    setError("");
    try {
      await api.revokeInvite(classId, invite.inviteId);
      onChange();
    } catch (failure) {
      setError(classroomError(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <li className="rounded-2xl border border-line bg-white p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <StatusPill tone={state.tone}>{state.label}</StatusPill>
        <span className="tabular-nums text-ink-soft">{invite.useCount}/{invite.maxUses} lượt</span>
      </div>
      <p className="mt-2 text-xs leading-5 text-ink-soft">
        {invite.createdByName} tạo {formatDateTime(invite.createdAt)}
        <br />Hết hạn {formatDateTime(invite.expiresAt)}
      </p>
      {error && <p role="alert" className="asset-error mt-2">{error}</p>}
      {canEdit && invite.state === "ACTIVE" && (
        <button type="button" className="mt-2 text-sm font-semibold text-berry hover:underline disabled:opacity-60" disabled={busy} onClick={() => void revoke()}>
          {busy ? "Đang thu hồi…" : "Thu hồi"}
        </button>
      )}
    </li>
  );
}

function CreateInviteDialog({ api, classId, className, onClose, onCreated }: { api: ClassroomApi; classId: string; className: string; onClose: () => void; onCreated: () => void }) {
  const [days, setDays] = useState(7);
  const [uses, setUses] = useState(30);
  const [issued, setIssued] = useState<IssuedClassInvite | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  async function create() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      setIssued(await api.createInvite(classId, { expiresInDays: days, maxUses: uses }));
      onCreated();
    } catch (failure) {
      setError(classroomError(failure));
    } finally {
      setBusy(false);
    }
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <Dialog title={issued ? "Lời mời đã sẵn sàng" : `Mời phụ huynh vào lớp ${className}`} onClose={onClose}>
      {issued ? (
        <div>
          <div className="print-card rounded-2xl border-2 border-dashed border-leaf/40 bg-leaf-soft p-5 text-center">
            <p className="text-sm font-medium text-leaf">LumiKids · Lớp {className}</p>
            <p className="mt-3 select-all font-mono text-3xl font-bold tracking-[0.14em] text-ink">{issued.code}</p>
            <p className="mt-3 text-xs leading-5 text-ink-soft">Phụ huynh đăng nhập → “Vào lớp” → nhập mã. Hết hạn {formatDateTime(issued.invite.expiresAt)}.</p>
          </div>
          <p className="mt-4 text-sm leading-6 text-[#8a5a00]">Mã chỉ hiện một lần. Sao chép đường dẫn hoặc in thẻ trước khi đóng.</p>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button type="button" className="asset-button-secondary" onClick={() => void copy(inviteLink(issued.code))}>{copied ? "Đã sao chép" : "Sao chép đường dẫn"}</button>
            <button type="button" className="asset-button-secondary" onClick={() => window.print()}>In thẻ</button>
            <button type="button" className="asset-button-primary" onClick={onClose}>Xong</button>
          </div>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="asset-label" htmlFor="invite-days">Dùng trong (ngày)</label>
              <input id="invite-days" type="number" min={1} max={30} className="asset-input mt-1" value={days} onChange={(event) => setDays(Number(event.target.value))} disabled={busy} />
            </div>
            <div>
              <label className="asset-label" htmlFor="invite-uses">Số lượt dùng</label>
              <input id="invite-uses" type="number" min={1} max={200} className="asset-input mt-1" value={uses} onChange={(event) => setUses(Number(event.target.value))} disabled={busy} />
            </div>
          </div>
          <p className="text-xs leading-5 text-ink-soft">Mỗi phụ huynh gửi yêu cầu dùng một lượt. Bạn vẫn duyệt từng trẻ trước khi trẻ vào lớp.</p>
          {error && <p role="alert" className="asset-error">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="asset-button-secondary" onClick={onClose} disabled={busy}>Hủy</button>
            <button className="asset-button-primary" disabled={busy || days < 1 || days > 30 || uses < 1 || uses > 200}>{busy ? "Đang tạo…" : "Tạo lời mời"}</button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
