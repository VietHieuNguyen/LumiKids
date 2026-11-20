"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { FamilyChild, InvitePreview } from "@lumikids/shared";
import { classroomError } from "../classrooms/api";
import type { ClassroomApi } from "../classrooms/api";
import { ClassroomShell, ErrorBanner, Notice, Panel } from "../classrooms/classroom-shell";
import { ageInYears, formatDate, localToday } from "../classrooms/format";
import { useClassroomSession } from "../classrooms/use-classroom-session";
import { useResource } from "../classrooms/use-resource";
import { consentScopeLabels, FamilyApi, inviteCodeFrom } from "./api";

export function FamilyJoinPage({ code, childId }: { code?: string; childId?: string }) {
  const { session, loading, api, allowed } = useClassroomSession("MANAGE_FAMILY");
  if (loading || !session || !api) return <Notice>Đang kiểm tra phiên đăng nhập…</Notice>;
  if (!allowed) return <Notice>Mã mời lớp dành cho phụ huynh. Hãy đăng nhập bằng tài khoản phụ huynh.</Notice>;
  return <Join key={session.user.userId} api={api} initialCode={code ?? ""} initialChild={childId ?? ""} />;
}

/** FR-1.8 + BR-15: check the invite, pick a child without a class, accept the sharing consent, send the request. */
function Join({ api, initialCode, initialChild }: { api: ClassroomApi; initialCode: string; initialChild: string }) {
  const family = useMemo(() => new FamilyApi(api), [api]);
  const children = useResource((signal) => family.children(signal), "family-children");
  const [code, setCode] = useState(initialCode);
  const [preview, setPreview] = useState<{ code: string; data: InvitePreview } | null>(null);
  const [childId, setChildId] = useState(initialChild);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<FamilyChild | null>(null);
  // Only children without a class and without a pending request can be sent.
  const eligible = (children.data ?? []).filter((child) => !child.currentClass && !child.joinRequests.some((request) => request.status === "PENDING"));
  const today = localToday();

  async function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = inviteCodeFrom(code);
    if (busy || !normalized) return;
    setBusy(true);
    setError("");
    setPreview(null);
    setConsent(false);
    try {
      setPreview({ code: normalized, data: await family.previewInvite(normalized) });
    } catch (failure) {
      setError(classroomError(failure));
    } finally {
      setBusy(false);
    }
  }
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !preview || !childId || !consent) return;
    setBusy(true);
    setError("");
    try {
      setSent(await family.requestJoin(preview.code, childId));
      children.reload();
    } catch (failure) {
      setError(classroomError(failure));
    } finally {
      setBusy(false);
    }
  }

  if (sent)
    return (
      <ClassroomShell title="Đã gửi yêu cầu" eyebrow="Gia đình" back={{ href: "/family", label: "Con của tôi" }}>
        <section role="status" className="max-w-xl rounded-3xl border border-line bg-paper p-6">
          <p className="font-display text-xl font-bold">Đang chờ giáo viên duyệt</p>
          <p className="mt-2 text-sm leading-6 text-ink-soft">
            Yêu cầu cho {sent.fullName} vào lớp {preview?.data.className} đã được gửi. Khi giáo viên duyệt, lớp sẽ hiện trong hồ sơ của con và giáo viên cấp mã đăng nhập mới.
          </p>
          <Link className="asset-button-primary mt-5" href={`/family/children/${sent.childId}`}>Xem hồ sơ của con</Link>
        </section>
      </ClassroomShell>
    );

  return (
    <ClassroomShell title="Vào lớp bằng mã mời" eyebrow="Gia đình" back={{ href: "/family", label: "Con của tôi" }}>
      <div className="grid max-w-3xl gap-6">
        <Panel title="1. Nhập mã mời" description="Giáo viên gửi mã dạng ABCDE-FGHJK hoặc một đường link. Dán vào đây.">
          <form className="flex flex-wrap gap-2" onSubmit={check}>
            <label className="sr-only" htmlFor="invite-code">Mã mời</label>
            <input id="invite-code" className="asset-input min-w-0 flex-1 font-mono uppercase tracking-wider" required maxLength={300} autoComplete="off" spellCheck={false} placeholder="ABCDE-FGHJK" value={code} onChange={(event) => setCode(event.target.value)} disabled={busy} />
            <button className="asset-button-primary" disabled={busy || !code.trim()}>{busy && !preview ? "Đang kiểm tra…" : "Kiểm tra mã"}</button>
          </form>
          {error && !preview && <p role="alert" className="asset-error mt-3">{error}</p>}
        </Panel>
        {preview && (
          <Panel title="2. Lớp học và đồng ý chia sẻ">
            <div className="rounded-2xl bg-leaf-soft p-4">
              <p className="font-display text-xl font-bold">Lớp {preview.data.className}</p>
              <p className="mt-1 text-sm text-ink-soft">
                {preview.data.schoolYearName} · {preview.data.ageGroupName}
                {preview.data.teacherNames.length ? ` · ${preview.data.teacherNames.join(", ")}` : ""}
              </p>
              <p className="mt-1 text-xs text-ink-soft">Mã còn hiệu lực đến {formatDate(preview.data.expiresAt)}.</p>
            </div>
            <form className="mt-5 space-y-4" onSubmit={send}>
              <fieldset>
                <legend className="text-sm font-bold">Cho con nào vào lớp?</legend>
                {children.error && <ErrorBanner message={children.error} onRetry={children.reload} />}
                {children.data && eligible.length === 0 && (
                  <p className="mt-2 text-sm text-ink-soft">
                    Không có hồ sơ nào đang chờ vào lớp. <Link className="font-semibold text-leaf underline" href="/family">Thêm hồ sơ con</Link> trước, hoặc con đã có lớp / đang chờ duyệt.
                  </p>
                )}
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {eligible.map((child) => {
                    const age = ageInYears(child.dob, today);
                    return (
                      <label key={child.childId} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border p-3 text-sm ${childId === child.childId ? "border-leaf bg-leaf-soft" : "border-line bg-white hover:bg-cream"}`}>
                        <input type="radio" name="join-child" className="h-4 w-4 accent-leaf" checked={childId === child.childId} onChange={() => setChildId(child.childId)} />
                        <span>
                          <span className="block font-semibold">{child.fullName}</span>
                          <span className="text-xs text-ink-soft">{age === null ? "" : `${age} tuổi`}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <div className="rounded-2xl border border-line bg-white p-4 text-sm leading-6">
                <p className="font-semibold">Khi con vào lớp, giáo viên của lớp được xem:</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {preview.data.consentScope.map((scope) => <li key={scope}>{consentScopeLabels[scope]}</li>)}
                </ul>
                <p className="mt-2 text-ink-soft">Chỉ trong thời gian con học lớp này. Bạn có thể rời lớp bất cứ lúc nào; khi đó giáo viên không xem được kết quả của con nữa.</p>
                <label className="mt-3 flex cursor-pointer gap-3 rounded-xl bg-sun-soft p-3 text-[#805b13]">
                  <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-leaf" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                  <span>Tôi là người giám hộ của con và đồng ý chia sẻ các thông tin trên với giáo viên lớp {preview.data.className} (phiên bản {preview.data.consentVersion}).</span>
                </label>
              </div>
              {error && <p role="alert" className="asset-error">{error}</p>}
              <div className="flex justify-end">
                <button className="lumi-button-sun" disabled={busy || !childId || !eligible.some((child) => child.childId === childId) || !consent}>{busy ? "Đang gửi…" : "Gửi yêu cầu vào lớp"}</button>
              </div>
            </form>
          </Panel>
        )}
      </div>
    </ClassroomShell>
  );
}
