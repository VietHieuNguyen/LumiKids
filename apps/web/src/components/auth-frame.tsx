import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { LumiLogo, LumiWordmark } from "@/components/lumi-logo";
import { LANDING_ASSETS } from "@/features/landing/landing-assets";

/** The sign-in look (valley poster + form panel) for guardian sign-up and email verification. */
export function AuthFrame({ title, lead, artTitle, artNote, children }: { title: string; lead: ReactNode; artTitle: string; artNote: string; children: ReactNode }) {
  return (
    <main className="lg-page">
      <aside className="lg-art" aria-hidden="true">
        <div className="lg-posterFrame">
          <Image className="lg-poster" src={LANDING_ASSETS.poster} alt="" fill priority sizes="(max-width: 900px) 100vw, 70vw" />
        </div>
        <div className="lg-artCopy">
          <p className="lg-artTitle">{artTitle}</p>
          <p className="lg-artNote">{artNote}</p>
        </div>
      </aside>
      <section className="lg-panel" aria-labelledby="auth-heading">
        <div className="lg-panelInner">
          <Link className="lg-brand" href="/" aria-label="LumiKids — về trang chủ">
            <LumiLogo />
            <LumiWordmark />
          </Link>
          <h1 id="auth-heading" className="lg-title">{title}</h1>
          <p className="lg-lead">{lead}</p>
          {children}
          <Link className="lg-back" href="/login">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8H4m3.5-3.5L4 8l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Về trang đăng nhập
          </Link>
        </div>
      </section>
    </main>
  );
}
