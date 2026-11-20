"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { FamilyChild } from "@lumikids/shared";
import { ClassroomShell, ErrorBanner, Notice, StatusPill } from "../classrooms/classroom-shell";
import { ageInYears, localToday } from "../classrooms/format";
import { useClassroomSession } from "../classrooms/use-classroom-session";
import { useResource } from "../classrooms/use-resource";
import type { ClassroomApi } from "../classrooms/api";
import { FamilyApi } from "./api";
import { ChildFormDialog } from "./child-form-dialog";

export function FamilyHomePage() {
  const { session, loading, api, allowed } = useClassroomSession("MANAGE_FAMILY");
  if (loading || !session || !api) return <Notice>Đang kiểm tra phiên đăng nhập…</Notice>;
  if (!allowed)
    return (
      <Notice>
        Khu vực này dành cho phụ huynh. <Link className="font-semibold text-leaf underline" href="/account">Về trang của bạn</Link>
      </Notice>
    );
  return <Children key={session.user.userId} api={api} />;
}

/** Where the child is: in a class, waiting for a teacher, or playing at home with family picks. */
export function childPlace(child: FamilyChild): { tone: "green" | "amber" | "blue"; label: string } {
  if (child.currentClass) return { tone: "green", label: `Lớp ${child.currentClass.className}` };
  if (child.joinRequests.some((request) => request.status === "PENDING")) return { tone: "amber", label: "Chờ giáo viên duyệt" };
  return { tone: "blue", label: "Chơi ở nhà" };
}

function Children({ api }: { api: ClassroomApi }) {
  const family = useMemo(() => new FamilyApi(api), [api]);
  const list = useResource((signal) => family.children(signal), "family-children");
  const [adding, setAdding] = useState(false);
  const today = localToday();
  return (
    <ClassroomShell
      title="Con của tôi"
      eyebrow="Gia đình"
      actions={
        <>
          <Link className="asset-button-secondary" href="/family/join">Vào lớp bằng mã mời</Link>
          <button type="button" className="lumi-button-sun" onClick={() => setAdding(true)}>
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M9 3v12M3 9h12" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
            Thêm hồ sơ con
          </button>
        </>
      }
    >
      {list.error && <ErrorBanner message={list.error} onRetry={list.reload} />}
      {!list.data && !list.error && <p role="status">Đang tải…</p>}
      {list.data && list.data.length === 0 && (
        <section className="rounded-3xl border border-line bg-paper p-6 sm:p-8">
          <h2 className="font-display text-2xl font-bold">Bắt đầu cùng con</h2>
          <ol className="mt-5 grid gap-4 sm:grid-cols-3">
            {[
              ["Thêm hồ sơ", "Họ tên và ngày sinh của con, để chọn trò đúng nhóm tuổi."],
              ["Cấp mã cho con", "Con vào trang Đăng nhập → “Bé vào chơi” và nhập mã riêng."],
              ["Chọn trò hoặc vào lớp", "Chọn trò trong kho để con chơi ở nhà, hoặc nhập mã mời của giáo viên."],
            ].map(([title, text], index) => (
              <li key={title} className="rounded-2xl border border-line bg-white p-4">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-sun-soft font-display font-bold" aria-hidden="true">{index + 1}</span>
                <p className="mt-3 font-semibold">{title}</p>
                <p className="mt-1 text-sm leading-6 text-ink-soft">{text}</p>
              </li>
            ))}
          </ol>
          <button type="button" className="lumi-button-sun mt-6" onClick={() => setAdding(true)}>Thêm hồ sơ con</button>
        </section>
      )}
      {list.data && list.data.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.data.map((child) => {
            const place = childPlace(child);
            const age = ageInYears(child.dob, today);
            return (
              <li key={child.childId}>
                <Link href={`/family/children/${child.childId}`} className="group flex h-full flex-col rounded-3xl border border-line bg-paper p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                  <div className="flex items-start gap-3">
                    <span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-sun-soft font-display text-xl font-bold ring-1 ring-sun-edge/40">
                      {child.fullName.trim().split(/\s+/).pop()?.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-display text-lg font-bold leading-tight group-hover:text-leaf">{child.fullName}</p>
                      <p className="text-sm text-ink-soft">{age === null ? "" : `${age} tuổi`}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <StatusPill tone={place.tone}>{place.label}</StatusPill>
                    {!child.currentClass && <StatusPill tone={child.loginCodeIssuedAt ? "green" : "slate"}>{child.loginCodeIssuedAt ? "Đã có mã" : "Chưa có mã"}</StatusPill>}
                  </div>
                  <span className="mt-auto pt-4 text-sm font-semibold text-leaf">Xem trò chơi và kết quả →</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {adding && (
        <ChildFormDialog
          family={family}
          onClose={() => setAdding(false)}
          onSaved={(child) => {
            setAdding(false);
            list.replace([...(list.data ?? []), child]);
          }}
        />
      )}
    </ClassroomShell>
  );
}
