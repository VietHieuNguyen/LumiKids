"use client";
import { useState } from "react";
import type { ReactNode } from "react";
import { CLASSROOM_BATCH_LIMIT } from "@lumikids/shared";
import type { ClassroomBatchResult } from "@lumikids/shared";
import { classroomError } from "./api";
import { Dialog, ErrorBanner } from "./classroom-shell";

export type BatchPerson = { id: string; name: string; detail?: string };

const reasons: Record<ClassroomBatchResult["skipped"][number]["reason"], string> = {
  NOT_ELIGIBLE: "Điều kiện đã thay đổi. Kiểm tra lại hồ sơ.",
  FAMILY_PROFILE: "Hồ sơ gia đình. Gửi lời mời để phụ huynh xác nhận.",
  HAS_CLASS: "Trẻ đã có lớp.",
  ALREADY_DECIDED: "Yêu cầu đã được xử lý.",
  AGE_REVIEW: "Nhóm tuổi khác với lớp. Cần xem riêng.",
  FAILED: "Chưa xác nhận được kết quả. Kiểm tra danh sách trước khi thử lại.",
};

export function BatchOutcome({ completed, skipped, people }: {
  completed: string;
  skipped: ClassroomBatchResult["skipped"];
  people: BatchPerson[];
}) {
  const names = new Map(people.map(({ id, name }) => [id, name]));
  return (
    <div>
      <p role="status" className="rounded-xl bg-leaf-soft p-3 font-semibold">{completed} · {skipped.length} chưa xử lý</p>
      {skipped.length > 0 && (
        <ul className="mt-3 divide-y divide-line text-sm">
          {skipped.map(({ id, reason }) => (
            <li key={id} className="py-2"><strong>{names.get(id) ?? "Hồ sơ đã chọn"}</strong><p className="text-ink-soft">{reasons[reason]}</p></li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Selecting and reviewing share one list. Mutations happen only on explicit confirmation. */
export function ClassroomBatchDialog<T>({ title, action, people, description, before, blocked, onClose, onConfirm, resultView }: {
  title: string;
  action: string;
  people: BatchPerson[];
  description: string;
  before?: ReactNode;
  blocked?: boolean;
  onClose: () => void;
  onConfirm: (ids: string[]) => Promise<T>;
  resultView: (result: T) => ReactNode;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<T | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selected = people.filter((person) => picked.has(person.id));

  async function confirm() {
    if (busy || blocked || !selected.length) return;
    setBusy(true);
    setError("");
    try {
      setResult(await onConfirm(selected.map((person) => person.id)));
    } catch (failure) {
      setError(classroomError(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={title} onClose={() => { if (!busy) onClose(); }} wide>
      {result ? (
        <>
          {resultView(result)}
          <div className="mt-4 flex justify-end"><button type="button" className="asset-button-secondary" onClick={onClose}>Xong</button></div>
        </>
      ) : (
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void confirm(); }}>
          <p className="text-sm text-ink-soft">{description}</p>
          <fieldset disabled={busy} className="min-w-0 space-y-3">
            <legend className="sr-only">Hồ sơ cần xử lý</legend>
            {before}
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="asset-button-secondary" disabled={!people.length} onClick={() => setPicked(new Set(people.slice(0, CLASSROOM_BATCH_LIMIT).map((person) => person.id)))}>
                {people.length > CLASSROOM_BATCH_LIMIT ? `Chọn ${CLASSROOM_BATCH_LIMIT} hồ sơ đầu` : "Chọn tất cả"}
              </button>
              {selected.length > 0 && <button type="button" className="asset-button-secondary" onClick={() => setPicked(new Set())}>Bỏ chọn</button>}
              <p role="status" className="text-sm font-semibold">{selected.length} hồ sơ đã chọn</p>
            </div>
            {people.length > CLASSROOM_BATCH_LIMIT && <p className="text-sm text-ink-soft">Mỗi lượt xử lý tối đa {CLASSROOM_BATCH_LIMIT} hồ sơ.</p>}
            <ul className="max-h-64 overflow-y-auto divide-y divide-line rounded-xl border border-line">
              {people.map(({ id, name, detail }) => (
                <li key={id}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 hover:bg-cream">
                    <input type="checkbox" checked={picked.has(id)} disabled={!picked.has(id) && selected.length >= CLASSROOM_BATCH_LIMIT} className="size-4 shrink-0 accent-leaf" onChange={(event) => {
                      const checked = event.target.checked;
                      setPicked((previous) => {
                        const next = new Set(previous);
                        if (checked) next.add(id);
                        else next.delete(id);
                        return next;
                      });
                    }} />
                    <span className="min-w-0 break-words text-sm"><strong>{name}</strong>{detail && <span className="block text-ink-soft">{detail}</span>}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
          {error && <ErrorBanner message={error} />}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="asset-button-secondary" disabled={busy} onClick={onClose}>Hủy</button>
            <button type="submit" className="asset-button-primary" disabled={busy || blocked || !selected.length}>{busy ? "Đang xử lý…" : `${action} (${selected.length})`}</button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
