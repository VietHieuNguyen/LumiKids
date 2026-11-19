import { AdminAssignmentDetailPage } from "@/features/classrooms/assignment-detail-page";
export default async function Page({ params }: { params: Promise<{ classId: string; assignmentId: string }> }) {
  const { classId, assignmentId } = await params;
  return <AdminAssignmentDetailPage classId={classId} assignmentId={assignmentId} />;
}
