import { FamilyJoinPage } from "@/features/family/family-join-page";

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function Page({ searchParams }: { searchParams: Promise<{ code?: string | string[]; child?: string | string[] }> }) {
  const { code, child } = await searchParams;
  return <FamilyJoinPage code={first(code)} childId={first(child)} />;
}
