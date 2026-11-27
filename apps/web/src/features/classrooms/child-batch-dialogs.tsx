"use client";
import { useState } from "react";
import { CLASSROOM_BATCH_LIMIT } from "@lumikids/shared";
import type { AdminChildPick, ClassroomBatchResult, ClassroomSummary } from "@lumikids/shared";
import { classroomError } from "./api";
import type { ClassroomApi } from "./api";
import { BatchOutcome } from "./classroom-batch-dialog";
import { Dialog } from "./classroom-shell";

/** Sends a large selection in API-sized chunks, one after another, and merges the outcomes. */
async function inChunks(ids: string[], send: (chunk: string[]) => Promise<ClassroomBatchResult>): Promise<ClassroomBatchResult> {
  const merged: ClassroomBatchResult = { completedIds: [], skipped: [] };
  for (let start = 0; start < ids.length; start += CLASSROOM_BATCH_LIMIT) {
    const result = await send(ids.slice(start, start + CLASSROOM_BATCH_LIMIT));
    merged.completedIds.push(...result.completedIds);
    merged.skipped.push(...result.skipped);
  }
  return merged;
}

function Group({ title, tone, names }: { title: string; tone: "go" | "skip"; names: string[] }) {
  if (!names.length) return null;
  return (
    <li className="rounded-lg border border-line px-3 py-2">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <span aria-hidden="true" className={`size-2 rounded-full ${tone === "go" ? "bg-leaf" : "bg-ink/30"}`} />
        {title} <span className="tabular-nums text-ink-soft">({names.length})</span>
      </p>
      <p className="mt-1 line-clamp-2 text-[13px] text-ink-soft">{names.slice(0, 8).join(", ")}{names.length > 8 ? ` và ${names.length - 8} trẻ khác` : ""}</p>
    </li>
  );
}

/**
 * Places unplaced school profiles and moves children from other classes in one confirmation. The preview is
 * worked out here from the picks; the server checks each child again and reports what it skipped.
 */
export function MoveChildrenDialog({
  api,
  picks,
  classes,
  initialTarget = "",
  onClose,
  onDone,
}: {
  api: ClassroomApi;
  picks: readonly AdminChildPick[];
  classes: readonly ClassroomSummary[];
  initialTarget?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [target, setTarget] = useState(initialTarget);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ClassroomBatchResult | null>(null);
  const targetClass = classes.find((item) => item.classId === target);
  const place = picks.filter((pick) => !pick.classId && !pick.managedByFamily);
  const move = picks.filter((pick) => pick.classId && pick.classId !== target);
  const family = picks.filter((pick) => !pick.classId && pick.managedByFamily);
  const same = picks.filter((pick) => pick.classId === target);
  const going = target ? [...place, ...move] : [];
  const names = (list: readonly AdminChildPick[]) => list.map((pick) => pick.fullName);

  async function confirm() {
    if (busy || !targetClass || !going.length) return;
    setBusy(true);
    setError("");
    try {
      setResult(await inChunks(going.map((pick) => pick.childId), (chunk) => api.enrollSchoolChildren(targetClass.classId, chunk)));
      onDone();
    } catch (failure) {
      setError(classroomError(failure));
    } finally {
      setBusy(false);
    }
  }

  if (result)
    return (
      <Dialog title="Đã xếp lớp" onClose={onClose} wide>
        <BatchOutcome
          people={picks.map((pick) => ({ id: pick.childId, name: pick.fullName }))}
          completed={`Đã đưa ${result.completedIds.length} trẻ vào lớp ${targetClass?.className ?? ""}`}
          skipped={result.skipped}
        />
        <div className="mt-5 flex justify-end">
          <button type="button" className="asset-button-primary" onClick={onClose}>Xong</button>
        </div>
      </Dialog>
    );

  return (
    <Dialog title={`Xếp lớp cho ${picks.length} trẻ`} onClose={busy ? () => undefined : onClose} wide>
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void confirm(); }}>
        <div>
          <label className="asset-label" htmlFor="move-target">Lớp nhận trẻ</label>
          <select id="move-target" className="asset-input mt-1" value={target} onChange={(event) => setTarget(event.target.value)} required disabled={busy}>
            <option value="">Chọn lớp đang mở</option>
            {classes.map((item) => (
              <option key={item.classId} value={item.classId}>{item.className} · {item.ageGroup.name} · {item.schoolYear.name} ({item.childCount} trẻ)</option>
            ))}
          </select>
        </div>
        {target ? (
          <ul className="space-y-2" aria-label="Xem trước">
            <Group title="Xếp vào lớp (chưa có lớp)" tone="go" names={names(place)} />
            <Group title="Chuyển từ lớp khác, giữ lịch sử" tone="go" names={names(move)} />
            <Group title="Bỏ qua: đã ở lớp này" tone="skip" names={names(same)} />
            <Group title="Bỏ qua: hồ sơ gia đình, cần phụ huynh vào lớp qua lời mời" tone="skip" names={names(family)} />
          </ul>
        ) : (
          <p className="text-sm text-ink-soft">Chọn lớp để xem trẻ nào được xếp, chuyển hoặc bỏ qua.</p>
        )}
        {error && <p role="alert" className="asset-error">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="asset-button-secondary" onClick={onClose} disabled={busy}>Hủy</button>
          <button className="asset-button-primary" disabled={busy || !targetClass || !going.length}>
            {busy ? "Đang xếp lớp…" : targetClass ? `Đưa ${going.length} trẻ vào ${targetClass.className}` : "Xếp lớp"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/** Lock or unlock many child profiles. A locked child cannot sign in; history and class stay as they are. */
export function ChildStatusDialog({
  api,
  picks,
  status,
  onClose,
  onDone,
}: {
  api: ClassroomApi;
  picks: readonly AdminChildPick[];
  status: "ACTIVE" | "DISABLED";
  onClose: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ClassroomBatchResult | null>(null);
  const lock = status === "DISABLED";
  const changing = picks.filter((pick) => pick.status !== status);
  const unchanged = picks.length - changing.length;

  async function confirm() {
    if (busy || !changing.length) return;
    setBusy(true);
    setError("");
    try {
      setResult(await inChunks(changing.map((pick) => pick.childId), (chunk) => api.setChildrenStatus(chunk, status)));
      onDone();
    } catch (failure) {
      setError(classroomError(failure));
    } finally {
      setBusy(false);
    }
  }

  if (result)
    return (
      <Dialog title={lock ? "Đã khóa hồ sơ" : "Đã mở khóa hồ sơ"} onClose={onClose}>
        <BatchOutcome
          people={picks.map((pick) => ({ id: pick.childId, name: pick.fullName }))}
          completed={`${lock ? "Đã khóa" : "Đã mở khóa"} ${result.completedIds.length} hồ sơ`}
          skipped={result.skipped}
        />
        <div className="mt-5 flex justify-end">
          <button type="button" className="asset-button-primary" onClick={onClose}>Xong</button>
        </div>
      </Dialog>
    );

  return (
    <Dialog title={lock ? `Khóa ${changing.length} hồ sơ trẻ` : `Mở khóa ${changing.length} hồ sơ trẻ`} onClose={busy ? () => undefined : onClose}>
      <p className="text-sm text-ink-soft">
        {changing.slice(0, 6).map((pick) => pick.fullName).join(", ")}
        {changing.length > 6 && ` và ${changing.length - 6} trẻ khác`}
      </p>
      <ul className="mt-4 space-y-2 text-sm leading-6">
        {(lock
          ? ["Trẻ không đăng nhập được, kể cả khi đã có mã.", "Lớp, bài đã giao và kết quả chơi được giữ nguyên.", "Có thể mở khóa bất cứ lúc nào."]
          : ["Trẻ đăng nhập lại được bằng mã hiện có.", "Trẻ chưa có mã cần giáo viên hoặc phụ huynh cấp mã."]
        ).map((line) => (
          <li key={line} className="flex gap-2">
            <span aria-hidden="true" className={`mt-2 size-1.5 shrink-0 rounded-full ${lock ? "bg-berry" : "bg-leaf"}`} />
            {line}
          </li>
        ))}
      </ul>
      {unchanged > 0 && <p className="mt-3 text-[13px] text-ink-soft">{unchanged} hồ sơ đã ở trạng thái này nên không đổi.</p>}
      {error && <p role="alert" className="asset-error mt-4">{error}</p>}
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="asset-button-secondary" onClick={onClose} disabled={busy}>Hủy</button>
        <button type="button" className={lock ? "asset-button-danger" : "asset-button-primary"} disabled={busy || !changing.length} onClick={() => void confirm()}>
          {busy ? "Đang lưu…" : lock ? `Khóa ${changing.length}` : `Mở khóa ${changing.length}`}
        </button>
      </div>
    </Dialog>
  );
}
