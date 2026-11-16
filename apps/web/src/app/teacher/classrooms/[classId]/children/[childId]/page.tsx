import { TeacherChildPage } from "@/features/classrooms/teacher-child-page";
export default async function Page({ params }: { params: Promise<{ classId: string; childId: string }> }) {
  const { classId, childId } = await params;
  return <TeacherChildPage classId={classId} childId={childId} />;
}
