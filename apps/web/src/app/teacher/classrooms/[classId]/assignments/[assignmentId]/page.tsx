import { AssignmentDetailPage } from "@/features/classrooms/assignment-detail-page";
export default async function Page({ params }: { params: Promise<{ classId: string; assignmentId: string }> }) {
  const { classId, assignmentId } = await params;
  return <AssignmentDetailPage classId={classId} assignmentId={assignmentId} />;
}
