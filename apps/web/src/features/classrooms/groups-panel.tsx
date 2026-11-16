"use client";
import { useState } from "react";
import type { FormEvent } from "react";
import type { ClassGroup, ClassroomDetail } from "@lumikids/shared";
import { classroomError } from "./api";
import type { AssignmentApi } from "./api";
import { Dialog, ErrorBanner, Panel } from "./classroom-shell";
import { useResource } from "./use-resource";

/** Fixed groups inside a class (e.g. "needs more counting practice"), to assign games to. */
export function GroupsPanel({ api, classroom, canEdit }: { api: AssignmentApi; classroom: ClassroomDetail; canEdit: boolean }) {
  const groups = useResource((signal) => api.groups(signal), classroom.classId);
  const [editing, setEditing] = useState<ClassGroup | "new" | null>(null);
  const names = new Map(classroom.children.map((child) => [child.childId, child.fullName]));
  return (
    <Panel
      title="Nhóm trong lớp"
      description="Tạo nhóm cố định (ví dụ theo kết quả chơi) để giao bài cho riêng nhóm đó. Trẻ chuyển lớp sẽ tự rời nhóm."
      actions={canEdit ? <button type="button" className="asset-button-primary" onClick={() => setEditing("new")}>Tạo nhóm</button> : undefined}
    >
      {groups.error && <ErrorBanner message={groups.error} onRetry={groups.reload} />}
      {groups.loading && !groups.data && <p role="status" className="text-sm text-ink-soft">Đang tải nhóm…</p>}
      {groups.data?.length === 0 && <p className="text-sm text-ink-soft">Lớp chưa có nhóm nào.</p>}
      <ul className="grid gap-3 sm:grid-cols-2">
        {(groups.data ?? []).map((group) => (
          <li key={group.groupId} className="rounded-2xl border border-line bg-white p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="break-words font-display text-lg font-bold">{group.name}</p>
                <p className="text-xs font-semibold text-ink-soft">{group.childIds.length} trẻ</p>
              </div>
              {canEdit && (
                <button type="button" className="asset-text-button" onClick={() => setEditing(group)}>Sửa</button>
              )}
            </div>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {group.childIds.map((id) => (
                <li key={id} className="rounded-full bg-leaf-soft px-2.5 py-1 text-xs font-semibold text-leaf">{names.get(id) ?? "Trẻ"}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {editing && (
        <GroupDialog
          api={api}
          classroom={classroom}
          group={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            groups.reload();
          }}
        />
      )}
    </Panel>
  );
}

function GroupDialog({
  api,
  classroom,
  group,
  onClose,
  onSaved,
}: {
  api: AssignmentApi;
  classroom: ClassroomDetail;
  group: ClassGroup | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(group?.name ?? "");
  const [picked, setPicked] = useState<Set<string>>(() => new Set(group?.childIds ?? []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      onSaved();
    } catch (failure) {
      setError(classroomError(failure));
    } finally {
      setBusy(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = { name: name.trim(), childIds: [...picked] };
    void run(() => (group ? api.updateGroup(group.groupId, input) : api.createGroup(input)));
  }
  return (
    <Dialog title={group ? `Sửa nhóm ${group.name}` : "Tạo nhóm"} onClose={onClose} wide>
      <form className="space-y-4" onSubmit={submit}>
        <div>
          <label className="asset-label" htmlFor="group-name">Tên nhóm</label>
          <input id="group-name" className="asset-input mt-1" required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="Nhóm Thỏ" />
        </div>
        <ChildPicker options={classroom.children} picked={picked} onChange={setPicked} />
        {error && <p role="alert" className="asset-error">{error}</p>}
        <div className="flex flex-wrap justify-between gap-2">
          {group ? (
            <button
              type="button"
              className="asset-button-secondary text-berry"
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Xóa nhóm ${group.name}? Bài đã giao cho nhóm vẫn giữ nguyên.`)) void run(() => api.deleteGroup(group.groupId));
              }}
            >
              Xóa nhóm
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" className="asset-button-secondary" onClick={onClose} disabled={busy}>Hủy</button>
            <button className="asset-button-primary" disabled={busy || !name.trim()}>{busy ? "Đang lưu…" : "Lưu nhóm"}</button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

/** Checkbox grid of the class's current children, with select all / none. */
export function ChildPicker({
  options,
  picked,
  onChange,
}: {
  options: { childId: string; fullName: string }[];
  picked: Set<string>;
  onChange: (value: Set<string>) => void;
}) {
  return (
    <fieldset>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <legend className="asset-label">Chọn trẻ ({picked.size}/{options.length})</legend>
        <div className="flex gap-1">
          <button type="button" className="asset-text-button" onClick={() => onChange(new Set(options.map((child) => child.childId)))}>Chọn hết</button>
          <button type="button" className="asset-text-button" onClick={() => onChange(new Set())}>Bỏ chọn</button>
        </div>
      </div>
      {options.length === 0 ? (
        <p className="mt-2 text-sm text-ink-soft">Lớp chưa có trẻ.</p>
      ) : (
        <div className="mt-2 grid max-h-72 gap-1.5 overflow-y-auto rounded-2xl border border-line bg-white p-2 sm:grid-cols-2">
          {options.map((child) => {
            const checked = picked.has(child.childId);
            return (
              <label key={child.childId} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 text-sm font-medium transition ${checked ? "bg-leaf-soft text-ink" : "hover:bg-cream"}`}>
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-[#2f8a4d]"
                  checked={checked}
                  onChange={() => {
                    const next = new Set(picked);
                    if (checked) next.delete(child.childId);
                    else next.add(child.childId);
                    onChange(next);
                  }}
                />
                <span className="min-w-0 break-words">{child.fullName}</span>
              </label>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}
