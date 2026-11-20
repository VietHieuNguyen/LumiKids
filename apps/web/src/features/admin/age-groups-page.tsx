"use client";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { AgeGroupUsage } from "@lumikids/shared";
import { classroomError } from "../classrooms/api";
import type { ClassroomApi } from "../classrooms/api";
import { ClassroomShell, Dialog, ErrorBanner, Notice, Panel } from "../classrooms/classroom-shell";
import { useClassroomSession } from "../classrooms/use-classroom-session";
import { useResource } from "../classrooms/use-resource";
import { AdminApi } from "./api";

export function AgeGroupsPage() {
  const { session, loading, api, allowed } = useClassroomSession("MANAGE_CLASSROOMS");
  if (loading || !session || !api) return <Notice>Đang kiểm tra phiên đăng nhập…</Notice>;
  if (!allowed) return <Notice>Bạn chưa có quyền quản lý nhóm tuổi.</Notice>;
  return <AgeGroups key={session.user.userId} api={api} />;
}

function Arrow({ up }: { up: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
      <path d={up ? "M8 12.5V3.5M4 7l4-4 4 4" : "M8 3.5v9M4 9l4 4 4-4"} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AgeGroups({ api }: { api: ClassroomApi }) {
  const admin = useMemo(() => new AdminApi(api), [api]);
  const groups = useResource((signal) => admin.ageGroups(signal), "age-groups");
  const [renaming, setRenaming] = useState<AgeGroupUsage | null>(null);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState("");
  const all = groups.data ?? [];

  async function move(index: number, by: -1 | 1) {
    const target = index + by;
    if (moving || target < 0 || target >= all.length) return;
    const order = all.map((group) => group.ageGroupId);
    [order[index], order[target]] = [order[target], order[index]];
    setMoving(true);
    setError("");
    try {
      groups.replace(await admin.reorderAgeGroups(order));
    } catch (failure) {
      setError(classroomError(failure));
    } finally {
      setMoving(false);
    }
  }

  return (
    <ClassroomShell title="Nhóm tuổi" eyebrow="Quản trị">
      {(groups.error || error) && <ErrorBanner message={groups.error || error} onRetry={() => { setError(""); groups.reload(); }} />}
      <Panel title="Nhóm tuổi" description="Thứ tự ở đây là thứ tự hiện trong mọi danh sách chọn nhóm tuổi (tạo lớp, lưu trò chơi, giáo án).">
        {groups.loading && !groups.data && <p role="status" className="py-6 text-sm text-ink-soft">Đang tải nhóm tuổi…</p>}
        {all.length > 0 && (
          <div className="-mx-4 overflow-x-auto sm:mx-0">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="border-b border-line text-ink-soft">
                <tr>
                  <th className="w-24 px-4 py-2 font-medium sm:px-3">Thứ tự</th>
                  <th className="px-3 py-2 font-medium">Tên hiển thị</th>
                  <th className="px-3 py-2 font-medium">Độ tuổi</th>
                  <th className="px-3 py-2 text-right font-medium">Lớp</th>
                  <th className="px-3 py-2 text-right font-medium">Trò chơi</th>
                  <th className="px-3 py-2 text-right font-medium">Giáo án</th>
                  <th className="px-3 py-2"><span className="sr-only">Thao tác</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {all.map((group, index) => (
                  <tr key={group.ageGroupId}>
                    <td className="px-4 py-2.5 sm:px-3">
                      <div className="flex items-center gap-1">
                        <button type="button" className="asset-button-secondary grid h-8 w-8 place-items-center" style={{ padding: 0, minHeight: 32 }} disabled={moving || index === 0} onClick={() => move(index, -1)} aria-label={`Đưa ${group.name} lên trên`}><Arrow up /></button>
                        <button type="button" className="asset-button-secondary grid h-8 w-8 place-items-center" style={{ padding: 0, minHeight: 32 }} disabled={moving || index === all.length - 1} onClick={() => move(index, 1)} aria-label={`Đưa ${group.name} xuống dưới`}><Arrow up={false} /></button>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-semibold">{group.name}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      {group.minAge}–{group.maxAge} tuổi
                      <span className="block text-xs tabular-nums text-ink-soft">{group.minAge * 12}–{group.maxAge * 12 - 1} tháng</span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {group.activeClassroomCount}
                      {group.classroomCount > group.activeClassroomCount && <span className="text-ink-soft"> / {group.classroomCount}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{group.activityCount}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{group.lessonPlanCount}</td>
                    <td className="px-3 py-2.5 text-right">
                      <button type="button" className="asset-button-secondary whitespace-nowrap" onClick={() => setRenaming(group)}>Đổi tên</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4 rounded-lg border border-line bg-cream px-4 py-3 text-[13px] leading-5 text-ink-soft">
          <p className="font-semibold text-ink">Vì sao không sửa được độ tuổi?</p>
          <p className="mt-1">
            Trò chơi chỉ giao được cho trẻ có tháng tuổi nằm trong khoảng của nhóm, và cách chấm điểm theo Chuẩn cũng dựa vào khoảng tuổi này.
            Đổi khoảng tuổi sẽ làm sai lệch bài đã giao và điểm đã lưu, nên ở đây chỉ đổi được tên và thứ tự.
          </p>
        </div>
      </Panel>
      {renaming && (
        <RenameDialog
          admin={admin}
          group={renaming}
          onClose={() => setRenaming(null)}
          onSaved={() => {
            setRenaming(null);
            groups.reload();
          }}
        />
      )}
    </ClassroomShell>
  );
}

function RenameDialog({ admin, group, onClose, onSaved }: { admin: AdminApi; group: AgeGroupUsage; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(group.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const used = group.classroomCount + group.activityCount + group.lessonPlanCount;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || name.trim() === group.name) return;
    setBusy(true);
    setError("");
    try {
      await admin.renameAgeGroup(group.ageGroupId, { name: name.trim() });
      onSaved();
    } catch (failure) {
      setError(classroomError(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title={`Đổi tên nhóm ${group.name}`} onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <div>
          <label className="asset-label" htmlFor="age-group-name">Tên hiển thị</label>
          <input id="age-group-name" className="asset-input mt-1" required maxLength={50} value={name} onChange={(event) => setName(event.target.value)} disabled={busy} />
          <p className="mt-1 text-xs text-ink-soft">Độ tuổi giữ nguyên: {group.minAge}–{group.maxAge} tuổi.</p>
        </div>
        {used > 0 && (
          <p className="text-[13px] leading-5 text-ink-soft">
            Tên mới hiện ngay ở {group.classroomCount} lớp, {group.activityCount} trò chơi và {group.lessonPlanCount} giáo án đang dùng nhóm này.
          </p>
        )}
        {error && <p role="alert" className="asset-error">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="asset-button-secondary" onClick={onClose} disabled={busy}>Hủy</button>
          <button className="asset-button-primary" disabled={busy || !name.trim() || name.trim() === group.name}>{busy ? "Đang lưu…" : "Lưu tên"}</button>
        </div>
      </form>
    </Dialog>
  );
}
