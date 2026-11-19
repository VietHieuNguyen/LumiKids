import type { Metadata } from "next";
import { ForestPreview } from "@/features/game-preview/forest-preview";

export const metadata: Metadata = {
  title: "Khu rừng nhỏ · LumiKids",
  robots: { index: false, follow: false },
};

export default function ForestPreviewPage() {
  return <ForestPreview />;
}
