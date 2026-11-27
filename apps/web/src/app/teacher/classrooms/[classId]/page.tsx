import { TeacherClassroomPage } from "@/features/classrooms/teacher-classroom-page";
import type { ClassroomTab } from "@/features/classrooms/teacher-classroom-page";

const tabs: readonly ClassroomTab[] = ["assignments", "children", "groups", "families"];

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { classId } = await params;
  const { tab } = await searchParams;
  const current = tabs.find((value) => value === tab) ?? "children";
  return <TeacherClassroomPage classId={classId} tab={current} />;
}
