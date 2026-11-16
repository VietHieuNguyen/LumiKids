import { TeacherClassroomPage } from "@/features/classrooms/teacher-classroom-page";
export default async function Page({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  return <TeacherClassroomPage classId={classId} />;
}
