import type { Metadata } from "next";
import { SavannaDemo } from "@/features/game-preview/savanna-demo";

export const metadata: Metadata = {
  title: "Thảo nguyên · LumiKids",
  robots: { index: false, follow: false },
};

export default async function SavannaDemoPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  return <SavannaDemo initialView={view === "scene" ? "scene" : "game"} />;
}
