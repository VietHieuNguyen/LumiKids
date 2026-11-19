import { AdminChildPage } from "@/features/classrooms/teacher-child-page";
export default async function Page({ params }: { params: Promise<{ classId: string; childId: string }> }) {
  const { classId, childId } = await params;
  return <AdminChildPage classId={classId} childId={childId} />;
}
