import { AdminChildrenPage } from "@/features/classrooms/admin-children-page";

export default async function Page({ searchParams }: { searchParams: Promise<{ target?: string }> }) {
  const { target } = await searchParams;
  return <AdminChildrenPage initialTarget={typeof target === "string" ? target : undefined} />;
}
