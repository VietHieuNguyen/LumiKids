"use client";
import { useState } from "react";
import type { FormEvent } from "react";
import type { FamilyChild } from "@lumikids/shared";
import { classroomError } from "../classrooms/api";
import { Dialog } from "../classrooms/classroom-shell";
import { localToday } from "../classrooms/format";
import type { FamilyApi } from "./api";

/** Add a child profile, or edit one the family manages (name, birthday, gender). */
export function ChildFormDialog({ family, child, onClose, onSaved }: { family: FamilyApi; child?: FamilyChild; onClose: () => void; onSaved: (child: FamilyChild) => void }) {
  const [fullName, setFullName] = useState(child?.fullName ?? "");
  const [dob, setDob] = useState(child?.dob ?? "");
  const [gender, setGender] = useState<"MALE" | "FEMALE">(child?.gender ?? "FEMALE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const input = { fullName: fullName.trim(), dob, gender };
      onSaved(child ? await family.updateChild(child.childId, input) : await family.createChild(input));
    } catch (failure) {
      setError(classroomError(failure));
      setBusy(false);
    }
  }
  return (
    <Dialog title={child ? `Sửa hồ sơ ${child.fullName}` : "Thêm hồ sơ của con"} onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <div>
          <label className="asset-label" htmlFor="family-child-name">Họ và tên của con</label>
          <input id="family-child-name" className="asset-input mt-1" required maxLength={120} autoComplete="off" value={fullName} onChange={(event) => setFullName(event.target.value)} disabled={busy} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="asset-label" htmlFor="family-child-dob">Ngày sinh</label>
            <input id="family-child-dob" type="date" className="asset-input mt-1" required max={localToday()} value={dob} onChange={(event) => setDob(event.target.value)} disabled={busy} />
          </div>
          <div>
            <label className="asset-label" htmlFor="family-child-gender">Giới tính</label>
            <select id="family-child-gender" className="asset-input mt-1" value={gender} onChange={(event) => setGender(event.target.value as "MALE" | "FEMALE")} disabled={busy}>
              <option value="FEMALE">Nữ</option>
              <option value="MALE">Nam</option>
            </select>
          </div>
        </div>
        <p className="text-xs leading-5 text-ink-soft">Ngày sinh dùng để chọn trò hợp với nhóm tuổi của con.</p>
        {error && <p role="alert" className="asset-error">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="asset-button-secondary" onClick={onClose} disabled={busy}>Hủy</button>
          <button className="asset-button-primary" disabled={busy || !fullName.trim() || !dob}>{busy ? "Đang lưu…" : child ? "Lưu" : "Thêm hồ sơ"}</button>
        </div>
      </form>
    </Dialog>
  );
}
