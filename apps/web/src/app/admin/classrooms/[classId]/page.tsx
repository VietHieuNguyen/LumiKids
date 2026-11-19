import { AdminClassroomDetailPage } from "@/features/classrooms/admin-classroom-detail-page";
import type { AdminClassroomTab } from "@/features/classrooms/admin-classroom-detail-page";

const tabs: readonly AdminClassroomTab[] = ["overview", "assignments"];

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { classId } = await params;
  const { tab } = await searchParams;
  const current = tabs.find((value) => value === tab) ?? "overview";
  return <AdminClassroomDetailPage classId={classId} tab={current} />;
}
