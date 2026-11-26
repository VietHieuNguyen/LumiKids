import { AssignmentNewPage } from "@/features/classrooms/assignment-new-page";

export default async function Page({ params, searchParams }: {
  params: Promise<{ classId: string }>;
  searchParams: Promise<{ child?: string | string[] }>;
}) {
  const [{ classId }, { child }] = await Promise.all([params, searchParams]);
  return <AssignmentNewPage classId={classId} initialChild={typeof child === "string" ? child : undefined} />;
}
