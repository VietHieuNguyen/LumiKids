import type { Metadata } from "next";
import { LandingPage } from "@/features/landing/landing-page";
import { lumiFontVariables } from "@/lib/lumi-fonts";

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
    <div className={lumiFontVariables}>
      <LandingPage />
    </div>
  );
}
