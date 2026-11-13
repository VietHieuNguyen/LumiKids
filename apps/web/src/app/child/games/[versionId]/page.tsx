import { ChildPlayPage } from "@/features/gameplay/child-play-page";
export default async function Page({
  params,
}: {
  params: Promise<{ versionId: string }>;
}) {
  const { versionId } = await params;
  return <ChildPlayPage versionId={versionId} />;
}
