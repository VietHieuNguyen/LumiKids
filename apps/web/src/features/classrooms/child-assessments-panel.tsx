"use client";
import { useState } from "react";
import { assessmentCriterionLabels } from "@lumikids/shared";
import type { TeacherAssessment, TeacherAssessmentDetail } from "@lumikids/shared";
import { classroomError } from "./api";
import type { ClassroomApi } from "./api";
import { ErrorBanner, Panel } from "./classroom-shell";
import { formatDateOnly, formatDateTime } from "./format";
import { useResource } from "./use-resource";

const CRITERIA = Array.from({ length: 11 }, (_, index) => String(42 + index));

type Draft = { criterionCode: string; periodStart: string; periodEnd: string; content: string };
const emptyDraft: Draft = { criterionCode: "42", periodStart: "", periodEnd: "", content: "" };

function NoteForm({
  initial,
  published,
  busy,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initial: Draft;
  published: boolean;
  busy: boolean;
  onSubmit: (draft: Draft, reason: string) => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  const [draft, setDraft] = useState(initial);
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState("");
  return (
    <form
      className="mt-4 space-y-4 border-t border-line pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!draft.periodStart || !draft.periodEnd) return setLocalError("Chọn kỳ đánh giá.");
        if (draft.periodStart > draft.periodEnd) return setLocalError("Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.");
        if (!draft.content.trim()) return setLocalError("Nhập nội dung nhận xét.");
        if (published && !reason.trim()) return setLocalError("Sửa nhận xét đã phát hành cần ghi lý do.");
        setLocalError("");
        onSubmit(draft, reason.trim());
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="asset-label" htmlFor="note-criterion">Chỉ số</label>
          <select id="note-criterion" className="asset-input mt-1" value={draft.criterionCode} onChange={(event) => setDraft({ ...draft, criterionCode: event.target.value })} disabled={busy}>
            {CRITERIA.map((code) => <option key={code} value={code}>Chỉ số {code}</option>)}
          </select>
        </div>
        <div>
          <label className="asset-label" htmlFor="note-start">Từ ngày</label>
          <input id="note-start" type="date" className="asset-input mt-1" value={draft.periodStart} onChange={(event) => setDraft({ ...draft, periodStart: event.target.value })} disabled={busy} required />
        </div>
        <div>
          <label className="asset-label" htmlFor="note-end">Đến ngày</label>
          <input id="note-end" type="date" className="asset-input mt-1" value={draft.periodEnd} onChange={(event) => setDraft({ ...draft, periodEnd: event.target.value })} disabled={busy} required />
        </div>
      </div>
      <div>
        <label className="asset-label" htmlFor="note-content">Nội dung nhận xét</label>
        <textarea id="note-content" className="asset-input mt-1 min-h-28" maxLength={2000} value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} disabled={busy} />
        <p className="mt-1 text-right text-xs text-ink-soft">{draft.content.length}/2000</p>
      </div>
      {published && (
        <div>
          <label className="asset-label" htmlFor="note-reason">Lý do sửa (bắt buộc)</label>
          <input id="note-reason" className="asset-input mt-1" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} disabled={busy} />
        </div>
      )}
      <p className="text-xs text-ink-soft">Nhận xét này chỉ ghi nhận quan sát của giáo viên. Không ảnh hưởng đến điểm, kỹ năng hay việc chọn trò chơi.</p>
      {localError && <p role="alert" className="asset-error">{localError}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="asset-button-secondary" onClick={onCancel} disabled={busy}>Hủy</button>
        <button className="asset-button-primary" disabled={busy}>{busy ? "Đang lưu…" : submitLabel}</button>
      </div>
    </form>
  );
}

function History({ api, classId, childId, assessmentId }: { api: ClassroomApi; classId: string; childId: string; assessmentId: string }) {
  const detail = useResource<TeacherAssessmentDetail>((signal) => api.assessment(classId, childId, assessmentId, signal), assessmentId);
  if (detail.error) return <ErrorBanner message={detail.error} onRetry={detail.reload} />;
  if (!detail.data) return <p role="status" className="text-sm">Đang tải lịch sử…</p>;
  if (detail.data.revisions.length === 0) return <p className="text-sm text-ink-soft">Chưa có lần sửa nào.</p>;
  return (
    <ol className="space-y-2 text-sm">
      {detail.data.revisions.map((revision) => (
        <li key={revision.revisionNo}>
          <p className="font-semibold">Lần sửa {revision.revisionNo} · {revision.changedByName || "Giáo viên"} · {formatDateTime(revision.changedAt)}</p>
          {revision.reason && <p className="mt-1 text-ink-soft">Lý do: {revision.reason}</p>}
          <p className="mt-2 text-ink-soft">Nội dung trước đó ({revision.previous.status === "PUBLISHED" ? "đã phát hành" : "nháp"}): {revision.previous.content}</p>
        </li>
      ))}
    </ol>
  );
}

/** FR-3.1: the teacher's own notes on a child. Drafts stay private until published; published notes keep their history. */
export function ChildAssessmentsPanel({ api, classId, childId }: { api: ClassroomApi; classId: string; childId: string }) {
  const list = useResource<TeacherAssessment[]>((signal) => api.assessments(classId, childId, signal), `${classId}:${childId}`);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [openHistory, setOpenHistory] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const notes = list.data ?? [];
  const editingNote = notes.find((note) => note.assessmentId === editing) ?? null;

  async function run(action: () => Promise<unknown>, done?: () => void) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
      done?.();
      list.reload();
    } catch (failure) {
      setError(classroomError(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title="Nhận xét của giáo viên"
      description="Quan sát riêng của giáo viên về trẻ. Nháp chỉ mình bạn thấy; nhận xét đã phát hành được giữ kèm lịch sử sửa."
      actions={!creating && <button type="button" className="asset-button-primary" onClick={() => { setCreating(true); setError(""); }}>Thêm nhận xét</button>}
    >
      {error && <p role="alert" className="asset-error mb-3">{error}</p>}
      {list.error && <ErrorBanner message={list.error} onRetry={list.reload} />}
      {creating && (
        <NoteForm
          initial={emptyDraft}
          published={false}
          busy={busy}
          submitLabel="Lưu nháp"
          onCancel={() => setCreating(false)}
          onSubmit={(draft) =>
            void run(() => api.createAssessment(classId, childId, draft), () => setCreating(false))
          }
        />
      )}
      {!list.data && !list.error && <p role="status" className="text-sm">Đang tải nhận xét…</p>}
      {list.data && notes.length === 0 && !creating && <p className="text-sm text-ink-soft">Chưa có nhận xét nào.</p>}
      <ul className="divide-y divide-line">
        {notes.map((note) => {
          const published = note.status === "PUBLISHED";
          return (
            <li key={note.assessmentId} className="py-5 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                <span className={`text-xs font-semibold uppercase tracking-wide ${published ? "text-leaf" : "text-ink-soft"}`}>{published ? "Đã phát hành" : "Nháp"}</span>
                <span className="font-semibold">Chỉ số {note.criterionCode} · {assessmentCriterionLabels[note.criterionCode]}</span>
                <span className="text-ink-soft">{formatDateOnly(note.periodStart)} – {formatDateOnly(note.periodEnd)}</span>
              </div>
              {editing === note.assessmentId && editingNote ? (
                <NoteForm
                  initial={{ criterionCode: note.criterionCode, periodStart: note.periodStart, periodEnd: note.periodEnd, content: note.content }}
                  published={published}
                  busy={busy}
                  submitLabel="Lưu thay đổi"
                  onCancel={() => setEditing(null)}
                  onSubmit={(draft, reason) =>
                    void run(
                      () => api.updateAssessment(classId, childId, note.assessmentId, { ...draft, ...(published ? { reason } : {}) }),
                      () => setEditing(null),
                    )
                  }
                />
              ) : (
                <p className="mt-2 whitespace-pre-line text-[15px] leading-7">{note.content}</p>
              )}
              {editing !== note.assessmentId && (
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  {!published && (
                    <button type="button" className="asset-button-primary" disabled={busy || creating} onClick={() => void run(() => api.publishAssessment(classId, childId, note.assessmentId))}>
                      Phát hành
                    </button>
                  )}
                  <button type="button" className="asset-text-button text-ink-soft" disabled={busy || creating} onClick={() => { setEditing(note.assessmentId); setError(""); }}>
                    Sửa
                  </button>
                  {note.revisionCount > 0 && (
                    <button type="button" className="asset-text-button text-ink-soft" onClick={() => setOpenHistory(openHistory === note.assessmentId ? null : note.assessmentId)}>
                      {openHistory === note.assessmentId ? "Ẩn lịch sử" : `Lịch sử sửa (${note.revisionCount})`}
                    </button>
                  )}
                  {!published && (
                    <button type="button" className="asset-text-button text-berry" disabled={busy || creating} onClick={() => void run(() => api.deleteAssessment(classId, childId, note.assessmentId))}>
                      Xóa nháp
                    </button>
                  )}
                </div>
              )}
              {openHistory === note.assessmentId && (
                <div className="mt-4 border-t border-line pt-4">
                  <History api={api} classId={classId} childId={childId} assessmentId={note.assessmentId} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
