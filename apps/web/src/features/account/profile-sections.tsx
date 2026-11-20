"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { accountProfileSchema } from "@lumikids/shared";
import type { AccountProfile, UpdateAccountProfileInput } from "@lumikids/shared";
import { useAuth } from "@/components/auth-provider";
import { classroomError } from "../classrooms/api";
import type { ClassroomApi } from "../classrooms/api";
import { useResource } from "../classrooms/use-resource";
import { relationshipLabels } from "../family/api";

const relationships = Object.entries(relationshipLabels) as [keyof typeof relationshipLabels, string][];

function ageLabel(dob: string, now: Date): string {
  const [year, month, day] = dob.split("-").map(Number);
  let age = now.getFullYear() - year;
  if (now.getMonth() + 1 < month || (now.getMonth() + 1 === month && now.getDate() < day)) age -= 1;
  return age < 1 ? "dưới 1 tuổi" : `${age} tuổi`;
}

const dateTime = (value: string) =>
  new Date(value).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });

/** Own profile: identity (editable), role details and sign-in safety. */
export function ProfileSections({ api }: { api: ClassroomApi }) {
  const profile = useResource(
    async (signal) => accountProfileSchema.parse(await api.raw("/auth/profile", { signal })),
    "profile",
  );
  if (profile.error)
    return (
      <p role="alert" className="asset-error mt-8">
        {profile.error}{" "}
        <button type="button" className="font-semibold underline" onClick={profile.reload}>Thử lại</button>
      </p>
    );
  if (!profile.data)
    return (
      <div className="mt-8 grid gap-4 lg:grid-cols-2" role="status" aria-label="Đang tải hồ sơ">
        <div className="h-56 animate-pulse rounded-3xl border border-line bg-paper" />
        <div className="h-56 animate-pulse rounded-3xl border border-line bg-paper" />
      </div>
    );
  return (
    <>
      <div className="mt-8 grid items-start gap-4 lg:grid-cols-2">
        <IdentityPanel api={api} profile={profile.data} onSaved={profile.replace} />
        <SafetyPanel profile={profile.data} />
      </div>
      {profile.data.teacher && <TeacherPanel teacher={profile.data.teacher} />}
      {profile.data.guardian && <GuardianPanel guardian={profile.data.guardian} />}
    </>
  );
}

function IdentityPanel({ api, profile, onSaved }: { api: ClassroomApi; profile: AccountProfile; onSaved: (profile: AccountProfile) => void }) {
  const { updateUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(profile.fullName);
  const [phone, setPhone] = useState(profile.phone);
  const [specialization, setSpecialization] = useState(profile.teacher?.specialization ?? "");
  const [relationship, setRelationship] = useState(profile.guardian?.relationship ?? "OTHER");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  function reset() {
    setFullName(profile.fullName);
    setPhone(profile.phone);
    setSpecialization(profile.teacher?.specialization ?? "");
    setRelationship(profile.guardian?.relationship ?? "OTHER");
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const input: UpdateAccountProfileInput = { fullName: fullName.trim(), phone: phone.trim() };
    if (profile.teacher) input.specialization = specialization.trim();
    if (profile.guardian) input.relationship = relationship;
    setBusy(true);
    setError("");
    try {
      const next = accountProfileSchema.parse(await api.raw("/auth/profile", { method: "PATCH", body: input }));
      onSaved(next);
      updateUser({ fullName: next.fullName });
      setEditing(false);
      setSaved(true);
    } catch (failure) {
      setError(classroomError(failure));
    } finally {
      setBusy(false);
    }
  }

  const rows: [string, string][] = [
    ["Họ và tên", profile.fullName],
    ["Email đăng nhập", profile.email],
    ["Số điện thoại", profile.phone || "Chưa có"],
    ...(profile.teacher ? ([["Chuyên môn", profile.teacher.specialization || "Chưa có"]] as [string, string][]) : []),
    ...(profile.guardian ? ([["Quan hệ với trẻ", relationshipLabels[profile.guardian.relationship]]] as [string, string][]) : []),
    ["Tham gia từ", new Date(profile.createdAt).toLocaleDateString("vi-VN")],
  ];

  return (
    <section aria-labelledby="identity-heading" className="rounded-3xl border border-line bg-paper p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="identity-heading" className="font-display text-xl font-bold">Thông tin cá nhân</h2>
        {!editing && (
          <button type="button" className="asset-button-secondary" onClick={() => { reset(); setSaved(false); setEditing(true); }}>
            Sửa thông tin
          </button>
        )}
      </div>
      {!editing ? (
        <>
          <dl className="mt-4 divide-y divide-line">
            {rows.map(([label, value]) => (
              <div key={label} className="grid gap-1 py-2.5 sm:grid-cols-[10rem_1fr]">
                <dt className="text-sm text-ink-soft">{label}</dt>
                <dd className="break-words font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          {saved && <p role="status" className="mt-3 text-sm font-semibold text-leaf">Đã lưu thông tin.</p>}
        </>
      ) : (
        <form className="mt-4 grid gap-4" onSubmit={submit}>
          <div>
            <label className="asset-label" htmlFor="profile-name">Họ và tên</label>
            <input id="profile-name" className="asset-input mt-1" required maxLength={120} autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} />
          </div>
          <div>
            <label className="asset-label" htmlFor="profile-email">Email đăng nhập</label>
            <input id="profile-email" className="asset-input mt-1" value={profile.email} disabled aria-describedby="profile-email-hint" />
            <p id="profile-email-hint" className="mt-1 text-xs text-ink-soft">Email là tên đăng nhập nên không đổi được.</p>
          </div>
          <div>
            <label className="asset-label" htmlFor="profile-phone">Số điện thoại (không bắt buộc)</label>
            <input id="profile-phone" type="tel" className="asset-input mt-1" maxLength={20} autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
          </div>
          {profile.teacher && (
            <div>
              <label className="asset-label" htmlFor="profile-specialization">Chuyên môn (không bắt buộc)</label>
              <input id="profile-specialization" className="asset-input mt-1" maxLength={200} placeholder="Giáo dục mầm non" value={specialization} onChange={(event) => setSpecialization(event.target.value)} />
            </div>
          )}
          {profile.guardian && (
            <fieldset>
              <legend className="asset-label">Quan hệ với trẻ</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {relationships.map(([value, label]) => (
                  <label key={value} className={`inline-flex min-h-10 cursor-pointer items-center rounded-full border px-4 text-sm font-semibold transition ${relationship === value ? "border-ink bg-ink text-white" : "border-line bg-cream hover:border-ink/40"}`}>
                    <input type="radio" name="relationship" value={value} className="sr-only" checked={relationship === value} onChange={() => setRelationship(value)} />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {error && <p role="alert" className="asset-error">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="asset-button-secondary" disabled={busy} onClick={() => { reset(); setEditing(false); }}>Hủy</button>
            <button className="asset-button-primary" disabled={busy || !fullName.trim()}>{busy ? "Đang lưu…" : "Lưu"}</button>
          </div>
        </form>
      )}
    </section>
  );
}

function SafetyPanel({ profile }: { profile: AccountProfile }) {
  return (
    <section aria-labelledby="safety-heading" className="rounded-3xl border border-line bg-paper p-5 sm:p-6">
      <h2 id="safety-heading" className="font-display text-xl font-bold">Đăng nhập và an toàn</h2>
      <dl className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-cream p-4">
          <dt className="text-xs font-semibold text-ink-soft">Lần đăng nhập trước</dt>
          <dd className="mt-1 font-semibold">{profile.previousLoginAt ? dateTime(profile.previousLoginAt) : "Đây là lần đầu"}</dd>
        </div>
        <div className="rounded-2xl bg-cream p-4">
          <dt className="text-xs font-semibold text-ink-soft">Thiết bị đang đăng nhập</dt>
          <dd className="mt-1 font-display text-2xl font-bold tabular-nums">{profile.activeSessions}</dd>
        </div>
      </dl>
      <p className="mt-3 text-sm leading-6 text-ink-soft">
        Không nhận ra lần đăng nhập trước, hoặc số thiết bị nhiều hơn bạn dùng? Hãy đổi mật khẩu ở dưới: mọi thiết bị sẽ bị đăng xuất.
      </p>
    </section>
  );
}

function TeacherPanel({ teacher }: { teacher: NonNullable<AccountProfile["teacher"]> }) {
  const children = teacher.classes.reduce((sum, item) => sum + item.childCount, 0);
  return (
    <section aria-labelledby="teacher-classes-heading" className="mt-4 rounded-3xl border border-line bg-paper p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="teacher-classes-heading" className="font-display text-xl font-bold">Lớp đang phụ trách</h2>
        {teacher.classes.length > 0 && <p className="text-sm text-ink-soft">{teacher.classes.length} lớp · {children} trẻ</p>}
      </div>
      {teacher.classes.length === 0 ? (
        <p className="mt-2 text-sm text-ink-soft">Bạn chưa được phân công lớp nào. Quản trị viên sẽ thêm bạn vào lớp.</p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {teacher.classes.map((item) => (
            <li key={item.classId}>
              <Link href={`/teacher/classrooms/${item.classId}`} className="flex h-full flex-col rounded-2xl border border-line bg-cream p-4 transition hover:-translate-y-0.5 hover:border-leaf/50">
                <span className="font-display text-lg font-bold">{item.className}</span>
                <span className="text-sm text-ink-soft">{item.ageGroupName} · {item.schoolYearName}</span>
                <span className="mt-2 text-sm font-semibold text-leaf">{item.childCount} trẻ đang học</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function GuardianPanel({ guardian }: { guardian: NonNullable<AccountProfile["guardian"]> }) {
  const now = useMemo(() => new Date(), []);
  return (
    <section aria-labelledby="guardian-children-heading" className="mt-4 rounded-3xl border border-line bg-paper p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="guardian-children-heading" className="font-display text-xl font-bold">Con của bạn</h2>
        <Link href="/family" className="asset-button-secondary">Quản lý hồ sơ con</Link>
      </div>
      {guardian.children.length === 0 ? (
        <p className="mt-2 text-sm text-ink-soft">Chưa có hồ sơ con. Thêm hồ sơ ở mục Con của tôi để cấp mã cho con chơi.</p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {guardian.children.map((child) => (
            <li key={child.childId} className="flex items-center gap-3 rounded-2xl border border-line bg-cream p-4">
              <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-sun-soft font-display text-lg font-bold ring-1 ring-sun-edge/40">
                {child.fullName.trim().split(/\s+/).pop()?.charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="block break-words font-semibold">{child.fullName}</span>
                <span className="text-sm text-ink-soft">{ageLabel(child.dob, now)} · {child.className ? `Lớp ${child.className}` : "Học tại nhà"}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
