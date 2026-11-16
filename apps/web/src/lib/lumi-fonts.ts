import { Baloo_2, Be_Vietnam_Pro } from "next/font/google";

/** Body face of the public pages (landing, login); exposed as `--font-lumi`. */
export const beVietnamPro = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-lumi",
});

/** Rounded, playful display face for headings (supports Vietnamese diacritics); exposed as `--font-lumi-display`. */
export const baloo = Baloo_2({
  subsets: ["latin", "vietnamese"],
  weight: ["600", "700", "800"],
  display: "swap",
  variable: "--font-lumi-display",
});

/** Class names that define both font variables on a wrapper element. */
export const lumiFontVariables = `${beVietnamPro.variable} ${baloo.variable}`;
