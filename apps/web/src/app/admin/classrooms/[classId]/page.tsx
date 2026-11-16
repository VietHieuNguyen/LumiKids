import { AdminClassroomDetailPage } from "@/features/classrooms/admin-classroom-detail-page";
export default async function Page({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  return <AdminClassroomDetailPage classId={classId} />;
}
