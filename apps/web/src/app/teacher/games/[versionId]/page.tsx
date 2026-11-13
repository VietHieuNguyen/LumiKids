import { GameDetailPage } from "@/features/game-library/game-detail-page";
export default async function Page({
  params,
}: {
  params: Promise<{ versionId: string }>;
}) {
  const { versionId } = await params;
  return <GameDetailPage versionId={versionId} />;
}
