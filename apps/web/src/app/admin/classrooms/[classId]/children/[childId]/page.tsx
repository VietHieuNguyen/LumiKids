import { AdminChildPage } from "@/features/classrooms/teacher-child-page";

export default async function Page({ params, searchParams }: {
  params: Promise<{ classId: string; childId: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const [{ classId, childId }, { from }] = await Promise.all([params, searchParams]);
  return <AdminChildPage classId={classId} childId={childId} fromDirectory={from === "directory"} />;
}
