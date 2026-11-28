import { AdminSupportChildPage } from "@/features/admin/support-child-page";

export default async function Page({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params;
  return <AdminSupportChildPage childId={childId} />;
}
