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

const title = "LumiKids — Học qua chơi, khám phá mỗi ngày";
const description = "Giáo viên mầm non biến chủ đề trên lớp thành trò chơi tương tác cho bé: quan sát, so sánh, đếm và phân loại.";
/** Share card (1200×630): the hero frame of the valley. Resolved against `metadataBase` in the root layout. */
const shareImage = { url: "/og/landing.jpg", width: 1200, height: 630, alt: "Thung lũng LumiKids với dòng chữ Học qua chơi, khám phá mỗi ngày" };

export const metadata: Metadata = {
  title,
  description,
  openGraph: { type: "website", locale: "vi_VN", siteName: "LumiKids", title, description, images: [shareImage] },
  twitter: { card: "summary_large_image", title, description, images: [shareImage.url] },
};

export default function Home() {
  return (
    <div className={`${beVietnamPro.variable} ${baloo.variable}`}>
      <LandingPage />
    </div>
  );
}
