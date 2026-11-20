"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { LessonPlanSummary } from "@lumikids/shared";
import { classroomError } from "../classrooms/api";
import type { ClassroomApi } from "../classrooms/api";
import { ClassroomShell, Dialog, ErrorBanner, Notice, StatusPill } from "../classrooms/classroom-shell";
import { formatDate } from "../classrooms/format";
import { useClassroomSession } from "../classrooms/use-classroom-session";
import { useResource } from "../classrooms/use-resource";
import type { GameLibraryApi } from "../game-library/api";
import { LessonPlanApi, lessonStatusLabels, lessonStatusTones } from "./api";

export function LessonPlansPage() {
  const { session, loading, api, libraryApi, allowed } = useClassroomSession("MANAGE_LESSON_PLANS");
  if (loading || !session || !api || !libraryApi) return <Notice>Đang kiểm tra phiên đăng nhập…</Notice>;
  if (!allowed)
    return (
      <Notice>
        Tài khoản này chưa soạn được giáo án. <Link className="font-semibold text-leaf underline" href="/account">Về trang của bạn</Link>
      </Notice>
    );
  return <Plans key={session.user.userId} api={api} library={libraryApi} />;
}

const emptyFilters = { search: "", status: "", ageGroupId: "", skillCode: "" };

function Plans({ api, library }: { api: ClassroomApi; library: GameLibraryApi }) {
  const plans = useMemo(() => new LessonPlanApi(api), [api]);
  const router = useRouter();
  const [filters, setFilters] = useState(emptyFilters);
  const [applied, setApplied] = useState(emptyFilters);
  const params = new URLSearchParams(Object.entries(applied).filter(([, value]) => value));
  const list = useResource((signal) => plans.list(params, signal), params.toString());
  const groups = useResource((signal) => library.ageGroups(signal), "age-groups");
  const skills = useResource((signal) => library.curriculum(signal), "curriculum");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setApplied({ ...filters });
  }
  async function duplicate(plan: LessonPlanSummary) {
    if (busyId) return;
    setBusyId(plan.lessonPlanId);
    setError("");
    try {
      const copy = await plans.duplicate(plan.lessonPlanId);
      router.push(`/teacher/lesson-plans/${copy.lessonPlanId}`);
    } catch (failure) {
      setError(classroomError(failure));
      setBusyId("");
    }
  }
  async function remove(plan: LessonPlanSummary) {
    if (busyId || !window.confirm(`Xóa giáo án “${plan.title}”? Không khôi phục được.`)) return;
    setBusyId(plan.lessonPlanId);
    setError("");
    try {
      await plans.remove(plan.lessonPlanId);
      if (list.data) list.replace(list.data.filter((entry) => entry.lessonPlanId !== plan.lessonPlanId));
    } catch (failure) {
      setError(classroomError(failure));
    } finally {
      setBusyId("");
    }
  }
  const filtered = Object.values(applied).some(Boolean);
  return (
    <ClassroomShell
      title="Giáo án"
      eyebrow="Giáo viên"
      actions={
        <button type="button" className="lumi-button-sun" onClick={() => setCreating(true)}>
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M9 3v12M3 9h12" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
          Giáo án mới
        </button>
      }
    >
      <form onSubmit={apply} className="mb-5 grid gap-3 rounded-3xl border border-line bg-paper p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]">
        <label className="asset-label">
          Tìm kiếm
          <input className="asset-input mt-1" placeholder="Tên hoặc chủ đề…" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
        </label>
        <label className="asset-label">
          Trạng thái
          <select className="asset-input mt-1" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
            <option value="">Tất cả</option>
            <option value="DRAFT">Bản nháp</option>
            <option value="COMPLETE">Hoàn thành</option>
          </select>
        </label>
        <label className="asset-label">
          Nhóm tuổi
          <select className="asset-input mt-1" value={filters.ageGroupId} onChange={(event) => setFilters({ ...filters, ageGroupId: event.target.value })}>
            <option value="">Mọi nhóm tuổi</option>
            {groups.data?.map((group) => <option key={group.ageGroupId} value={group.ageGroupId}>{group.name}</option>)}
          </select>
        </label>
        <label className="asset-label">
          Chuẩn
          <select className="asset-input mt-1" value={filters.skillCode} onChange={(event) => setFilters({ ...filters, skillCode: event.target.value })}>
            <option value="">Mọi chuẩn</option>
            {skills.data?.map((skill) => <option key={skill.skillCode} value={skill.skillCode}>Chuẩn {skill.skillCode}</option>)}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button className="asset-button-primary">Lọc</button>
          {filtered && <button type="button" className="asset-button-secondary" onClick={() => { setFilters(emptyFilters); setApplied(emptyFilters); }}>Bỏ lọc</button>}
        </div>
      </form>
      {(list.error || error) && <ErrorBanner message={error || list.error} onRetry={list.error ? list.reload : undefined} />}
      {!list.data && !list.error && <p role="status">Đang tải…</p>}
      {list.data?.length === 0 && (
        <section className="rounded-3xl border border-line bg-paper p-6 text-center">
          <p className="font-display text-xl font-bold">{filtered ? "Không có giáo án khớp bộ lọc" : "Chưa có giáo án nào"}</p>
          <p className="mt-2 text-sm text-ink-soft">Giáo án gồm mục tiêu, chuẩn bị, tiến trình hoạt động (có thể gắn trò chơi trong kho) và đánh giá.</p>
          {!filtered && <button type="button" className="lumi-button-sun mt-5" onClick={() => setCreating(true)}>Soạn giáo án đầu tiên</button>}
        </section>
      )}
      {list.data && list.data.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.data.map((plan) => (
            <li key={plan.lessonPlanId} className="flex flex-col rounded-3xl border border-line bg-paper p-5 shadow-sm">
              <div className="flex flex-wrap gap-2">
                <StatusPill tone={lessonStatusTones[plan.status]}>{lessonStatusLabels[plan.status]}</StatusPill>
                {plan.ageGroupName && <StatusPill tone="slate">{plan.ageGroupName}</StatusPill>}
                {plan.skillCode && <StatusPill tone="blue">Chuẩn {plan.skillCode}</StatusPill>}
              </div>
              <h2 className="mt-3 break-words font-display text-xl font-bold leading-7">
                <Link href={`/teacher/lesson-plans/${plan.lessonPlanId}`} className="rounded hover:text-leaf">{plan.title}</Link>
              </h2>
              {plan.topic && <p className="mt-1 line-clamp-2 text-sm text-ink-soft">{plan.topic}</p>}
              <p className="mt-3 text-xs text-ink-soft">
                {plan.blockCount} hoạt động · {plan.gameCount} trò chơi{plan.durationMinutes ? ` · ${plan.durationMinutes} phút` : ""} · sửa {formatDate(plan.updatedAt)}
              </p>
              <div className="mt-auto flex gap-2 border-t border-line pt-4">
                <Link className="asset-button-primary flex-1" href={`/teacher/lesson-plans/${plan.lessonPlanId}`}>Mở</Link>
                <button type="button" className="asset-button-secondary" disabled={Boolean(busyId)} onClick={() => void duplicate(plan)} aria-label={`Nhân bản ${plan.title}`}>Nhân bản</button>
                <button type="button" className="asset-button-secondary" disabled={Boolean(busyId)} onClick={() => void remove(plan)} aria-label={`Xóa ${plan.title}`}>Xóa</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {creating && (
        <CreatePlanDialog
          plans={plans}
          groups={groups.data ?? []}
          onClose={() => setCreating(false)}
          onCreated={(lessonPlanId) => router.push(`/teacher/lesson-plans/${lessonPlanId}`)}
        />
      )}
    </ClassroomShell>
  );
}

function CreatePlanDialog({ plans, groups, onClose, onCreated }: { plans: LessonPlanApi; groups: { ageGroupId: string; name: string }[]; onClose: () => void; onCreated: (id: string) => void }) {
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [ageGroupId, setAgeGroupId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const created = await plans.create({ title: title.trim(), topic: topic.trim(), ageGroupId: ageGroupId || null });
      onCreated(created.lessonPlanId);
    } catch (failure) {
      setError(classroomError(failure));
      setBusy(false);
    }
  }
  return (
    <Dialog title="Giáo án mới" onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <div>
          <label className="asset-label" htmlFor="plan-title">Tên giáo án</label>
          <input id="plan-title" className="asset-input mt-1" required maxLength={200} placeholder="Ví dụ: Bé đếm các con vật trong vườn" value={title} onChange={(event) => setTitle(event.target.value)} />
        </div>
        <div>
          <label className="asset-label" htmlFor="plan-topic">Chủ đề (tùy chọn)</label>
          <input id="plan-topic" className="asset-input mt-1" maxLength={200} value={topic} onChange={(event) => setTopic(event.target.value)} />
        </div>
        <div>
          <label className="asset-label" htmlFor="plan-age">Nhóm tuổi (tùy chọn)</label>
          <select id="plan-age" className="asset-input mt-1" value={ageGroupId} onChange={(event) => setAgeGroupId(event.target.value)}>
            <option value="">Chưa chọn</option>
            {groups.map((group) => <option key={group.ageGroupId} value={group.ageGroupId}>{group.name}</option>)}
          </select>
        </div>
        {error && <p role="alert" className="asset-error">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="asset-button-secondary" onClick={onClose} disabled={busy}>Hủy</button>
          <button className="asset-button-primary" disabled={busy || !title.trim()}>{busy ? "Đang tạo…" : "Tạo và soạn"}</button>
        </div>
      </form>
    </Dialog>
  );
}
