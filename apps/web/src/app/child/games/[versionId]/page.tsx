import { redirect } from "next/navigation";
import { ChildPlayPage } from "@/features/gameplay/child-play-page";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ versionId: string }>;
  searchParams: Promise<{ assignmentId?: string | string[] }>;
}) {
  const [{ versionId }, { assignmentId }] = await Promise.all([params, searchParams]);
  if (typeof assignmentId !== "string" || !assignmentId) redirect("/child/games");
  return <ChildPlayPage assignmentId={assignmentId} versionId={versionId} />;
}
