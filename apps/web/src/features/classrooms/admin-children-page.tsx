"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import type { ChildProfile } from "@lumikids/shared";
import type { ClassroomApi } from "./api";
import { ChildrenPanel, EditChildDialog, TransferDialog } from "./admin-classroom-detail-page";
import { ClassroomShell, ErrorBanner, Notice, Panel, StatusPill } from "./classroom-shell";
import { formatDateOnly } from "./format";
import { BatchOutcome, ClassroomBatchDialog } from "./classroom-batch-dialog";
import type { BatchPerson } from "./classroom-batch-dialog";
import { RosterTools, useRoster } from "./roster-tools";
import { useClassroomSession } from "./use-classroom-session";
import { useResource } from "./use-resource";

export function AdminChildrenPage({ initialTarget }: { initialTarget?: string }) {
  const { session, loading, api, allowed } = useClassroomSession("MANAGE_CLASSROOMS");
  if (loading || !session || !api) return <Notice>Đang kiểm tra phiên đăng nhập…</Notice>;
  if (!allowed) return <Notice>Bạn chưa có quyền quản lý trẻ.</Notice>;
  return <Directory key={`${session.user.userId}:${initialTarget ?? ""}`} api={api} initialTarget={initialTarget} memoryKey={session.user.userId} />;
}

function Directory({ api, initialTarget, memoryKey }: { api: ClassroomApi; initialTarget?: string; memoryKey: string }) {
  const classes = useResource((signal) => api.adminClassrooms(new URLSearchParams({ status: "ACTIVE" }), signal), "active");
  const unassigned = useResource((signal) => api.unassignedChildren(signal), "unassigned");
  const searchParams = useSearchParams();
  const classId = searchParams.get("class") ?? "";
  const selectedClass = classes.data?.find((item) => item.classId === classId);
  function setClassId(id: string) {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("class", id);
    else url.searchParams.delete("class");
    window.history.replaceState(null, "", url.pathname + url.search);
  }
  const [selected, setSelected] = useState<ChildProfile | null>(null);
  const [batch, setBatch] = useState<BatchPerson[] | null>(null);
  const [batchClassId, setBatchClassId] = useState("");
  const [editing, setEditing] = useState<ChildProfile | null>(null);
  const [result, setResult] = useState<{ message: string; destination: string } | null>(null);
  const roster = useRoster(unassigned.data ?? [], `${memoryKey}:unassigned`);
  const target = classes.data?.find((item) => item.classId === initialTarget);
  const batchTarget = classes.data?.find((item) => item.classId === batchClassId);
  const batchEligible = roster.children.filter((child) => !child.managedByFamily && child.status === "ACTIVE");

  return (
    <ClassroomShell title="Quản lý trẻ" back={{ href: "/admin", label: "Tổng quan" }} actions={<Link href="/admin/classrooms" className="asset-button-secondary">Danh sách lớp</Link>}>
      <div className="mb-5 rounded-2xl border border-line bg-paper p-4">
        <label className="asset-label" htmlFor="directory-class">Danh sách cần xem</label>
        <select id="directory-class" className="asset-input mt-1 max-w-lg" value={selectedClass?.classId ?? ""} disabled={!classes.data} onChange={(event) => setClassId(event.target.value)}>
          <option value="">Trẻ chưa xếp lớp{unassigned.data ? ` (${unassigned.data.length})` : ""}</option>
          {(classes.data ?? []).map((item) => <option key={item.classId} value={item.classId}>{item.className} · {item.schoolYear.name} ({item.childCount} trẻ)</option>)}
        </select>
        {classes.error && <ErrorBanner message={classes.error} onRetry={classes.reload} />}
      </div>
      {result && <p role="status" className="mb-4 rounded-xl bg-leaf-soft p-3 text-sm text-leaf">{result.message} <Link className="font-bold underline" href={result.destination}>Mở lớp</Link></p>}
      {classId ? (
        selectedClass ? <ClassRoster key={classId} api={api} classId={classId} onChange={classes.reload} memoryKey={`${memoryKey}:${classId}`} />
          : classes.data ? <ErrorBanner message="Lớp này không có trong danh sách lớp đang mở." />
          : !classes.error && <p role="status">Đang tải lớp đã chọn…</p>
      ) : (
        <div id="unassigned-children" className="scroll-mt-20"><Panel title="Trẻ chưa xếp lớp" description={target ? `Lớp đang chọn để tiếp nhận: ${target.className}.` : "Chọn hồ sơ cần xếp và lớp nhận trẻ."}
          actions={batchEligible.length > 0 && <button type="button" className="asset-button-primary" onClick={() => {
            setBatchClassId(target?.classId ?? "");
            setBatch(batchEligible.map((child) => ({ id: child.childId, name: child.fullName, detail: formatDateOnly(child.dob) })));
          }}>Xếp lớp hàng loạt</button>}>
          {unassigned.error && <ErrorBanner message={unassigned.error} onRetry={unassigned.reload} />}
          {!unassigned.data && !unassigned.error && <p role="status">Đang tải hồ sơ…</p>}
          {!!unassigned.data?.length && <RosterTools query={roster.query} setQuery={roster.setQuery} count={roster.children.length} />}
          {unassigned.data?.length === 0 && <p className="py-4 text-sm text-ink-soft">Hiện không có trẻ chưa xếp lớp.</p>}
          {!!unassigned.data?.length && roster.children.length === 0 && <p className="py-4 text-sm text-ink-soft">Không tìm thấy tên phù hợp.</p>}
          <ul className="divide-y divide-line">
            {roster.children.map((child) => (
              <li key={child.childId} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 grow basis-48">
                  <p className="break-words font-semibold">{child.fullName}</p>
                  <p className="text-sm text-ink-soft">{formatDateOnly(child.dob)}</p>
                </div>
                {child.status === "DISABLED" && <StatusPill tone="red">Đã khóa</StatusPill>}
                {child.managedByFamily && <StatusPill tone="blue">Gia đình quản lý · Vào lớp qua lời mời</StatusPill>}
                <div className="flex flex-wrap gap-2">
                  <button className="asset-button-secondary" type="button" onClick={() => setEditing(child)}>Sửa hồ sơ</button>
                  {!child.managedByFamily && child.status === "ACTIVE" && <button className="asset-button-primary" type="button" onClick={() => setSelected(child)}>Xếp lớp</button>}
                </div>
              </li>
            ))}
          </ul>
        </Panel></div>
      )}
      {batch && <ClassroomBatchDialog
        title="Xếp lớp hàng loạt"
        action={batchTarget ? `Xếp vào lớp ${batchTarget.className}` : "Xếp lớp"}
        people={batch}
        description="Danh sách gồm các hồ sơ do trường quản lý, đang hoạt động và chưa có lớp theo bộ lọc hiện tại."
        blocked={!batchTarget}
        before={<div>
          <label htmlFor="bulk-enrollment-class" className="asset-label">Lớp nhận trẻ</label>
          <select id="bulk-enrollment-class" className="asset-input mt-1" value={batchClassId} onChange={(event) => setBatchClassId(event.target.value)} required>
            <option value="">Chọn lớp</option>
            {(classes.data ?? []).map((item) => <option key={item.classId} value={item.classId}>{item.className} · {item.schoolYear.name} · {item.ageGroup.name}</option>)}
          </select>
        </div>}
        onClose={() => setBatch(null)}
        onConfirm={async (ids) => {
          const result = await api.enrollSchoolChildren(batchClassId, ids);
          unassigned.reload();
          classes.reload();
          return result;
        }}
        resultView={(result) => <BatchOutcome people={batch} completed={`Đã xếp lớp cho ${result.completedIds.length} trẻ`} skipped={result.skipped} />}
      />}
      {selected && <TransferDialog api={api} child={selected} initialTarget={initialTarget} onClose={() => setSelected(null)} onMoved={(destination) => {
        setResult({ message: `Đã xếp ${selected.fullName} vào lớp ${destination.className}.`, destination: `/admin/classrooms/${destination.classId}` });
        unassigned.replace((unassigned.data ?? []).filter((child) => child.childId !== selected.childId));
        setSelected(null);
        classes.reload();
      }} />}
      {editing && <EditChildDialog api={api} child={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); unassigned.reload(); }} />}
    </ClassroomShell>
  );
}

function ClassRoster({ api, classId, onChange, memoryKey }: { api: ClassroomApi; classId: string; onChange: () => void; memoryKey: string }) {
  const classroom = useResource((signal) => api.adminClassroom(classId, signal), classId);
  return (
    <>
      {classroom.error && <ErrorBanner message={classroom.error} onRetry={classroom.reload} />}
      {!classroom.data && !classroom.error && <p role="status">Đang tải danh sách lớp…</p>}
      {classroom.data && <ChildrenPanel api={api} classroom={classroom.data} directoryMemoryKey={memoryKey} onChange={(value) => { classroom.replace(value); onChange(); }} reload={() => { classroom.reload(); onChange(); }} />}
    </>
  );
}
