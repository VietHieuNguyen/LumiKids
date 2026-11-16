import { AssignmentNewPage } from "@/features/classrooms/assignment-new-page";
export default async function Page({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  return <AssignmentNewPage classId={classId} />;
}
