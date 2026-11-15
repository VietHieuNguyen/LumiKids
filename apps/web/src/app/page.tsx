import type { Metadata } from "next";
import { Baloo_2, Be_Vietnam_Pro } from "next/font/google";
import { LandingPage } from "@/features/landing/landing-page";

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-lumi",
});

// Rounded, playful display face for headings (supports Vietnamese diacritics).
const baloo = Baloo_2({
  subsets: ["latin", "vietnamese"],
  weight: ["600", "700", "800"],
  display: "swap",
  variable: "--font-lumi-display",
});

export const metadata: Metadata = {
  title: "LumiKids — Học qua chơi, khám phá mỗi ngày",
  description: "Giáo viên mầm non biến chủ đề trên lớp thành trò chơi tương tác cho bé: quan sát, so sánh, đếm và phân loại.",
};

export default function Home() {
  return (
    <div className={`${beVietnamPro.variable} ${baloo.variable}`}>
      <LandingPage />
    </div>
  );
}
