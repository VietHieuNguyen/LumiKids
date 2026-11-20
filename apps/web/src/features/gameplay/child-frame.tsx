"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";
import { LumiLogo, LumiWordmark } from "@/components/lumi-logo";

/** Valley sky, clouds and hills behind the children's screens (decorative only). */
function Valley() {
  return (
    <div className="ck-sky" aria-hidden="true">
      <div className="ck-sun" />
      <div className="ck-cloud" />
      <div className="ck-cloud" />
      <svg className="ck-hills" viewBox="0 0 1440 260" preserveAspectRatio="none">
        <path d="M0 150C160 90 300 80 470 120s300 70 470 20 330-90 500-40v150H0Z" fill="#cfe9d4" />
        <path d="M0 200c190-50 360-60 560-20s360 40 560 0 240-30 320-20v100H0Z" fill="#a9d7b4" />
        <path d="M0 236c240-30 470-28 720-6s480 16 720-4v34H0Z" fill="#88c497" />
      </svg>
    </div>
  );
}

export function ChildFrame({
  childName,
  logout,
  children,
}: {
  childName?: string;
  logout?: () => Promise<void>;
  children: ReactNode;
}) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  return (
    <div className="ck">
      <Valley />
      <header className="ck-top">
        <span className="ck-brand">
          <LumiLogo size={34} />
          <LumiWordmark />
        </span>
        {childName && (
          <div className="ck-me">
            <Link className="ck-meLink" href="/child/me" aria-label={`Góc của ${childName}`}>
              <span className="ck-avatar" aria-hidden="true">{childName.charAt(0).toUpperCase()}</span>
              <span className="ck-meName">{childName}</span>
            </Link>
            {logout && (
              <button
                type="button"
                className="ck-exit"
                disabled={leaving}
                onClick={() => {
                  setLeaving(true);
                  // Leave even if the server is unreachable: the next child must not inherit this session.
                  logout().catch(() => {}).finally(() => router.replace("/login?mode=child"));
                }}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M8 3H4.5A1.5 1.5 0 0 0 3 4.5v11A1.5 1.5 0 0 0 4.5 17H8M13 6l4 4-4 4M17 10H8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {leaving ? "Đang thoát…" : "Thoát"}
              </button>
            )}
          </div>
        )}
      </header>
      {children}
    </div>
  );
}

export function SayButton({ text, speak, label = "Nghe đọc" }: { text: string; speak: (text: string) => void; label?: string }) {
  return (
    <button type="button" className="ck-say" onClick={() => speak(text)} aria-label={`${label}: ${text}`}>
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 9.5v5h3.5L12 18V6L7.5 9.5H4Z" fill="currentColor" />
        <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </button>
  );
}

export function Star({ filled }: { filled: boolean }) {
  return (
    <svg className="ck-star" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2.8l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6-4.5-4.2 6.1-.8Z"
        fill={filled ? "#ffc02e" : "#fff"}
        stroke={filled ? "#d99a14" : "#c9d3cd"}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
