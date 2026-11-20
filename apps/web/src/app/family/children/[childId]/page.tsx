import { FamilyChildPage } from "@/features/family/family-child-page";

export default async function Page({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params;
  return <FamilyChildPage childId={childId} />;
}
