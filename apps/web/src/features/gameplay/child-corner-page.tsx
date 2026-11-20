"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ChildCorner } from "@lumikids/shared";
import { GameSymbol } from "../game-runtime/components/game-symbol";
import type { GameplayApi } from "./api";
import { gameplayError } from "./api";
import { ChildFrame, SayButton } from "./child-frame";
import { givenName } from "./child-format";
import { useGameplaySession } from "./use-gameplay-session";
import { useSpeech } from "./use-speech";

const weekdays = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const weekdayNames = ["Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy", "Chủ nhật"];

/** "Góc của bé": the child's own corner. What they finished and when they played; never a score. */
export function ChildCornerPage() {
  const { session, loading, api, logout } = useGameplaySession();
  if (loading || !session || !api)
    return (
      <ChildFrame>
        <main className="ck-main" role="status" aria-label="Đang mở">
          <div className="ck-skeleton" />
        </main>
      </ChildFrame>
    );
  const name = givenName(session.child.fullName);
  return (
    <ChildFrame childName={name} logout={logout}>
      <Corner key={session.child.childId} api={api} name={name} />
    </ChildFrame>
  );
}

function Corner({ api, name }: { api: GameplayApi; name: string }) {
  const { canSpeak, speak } = useSpeech();
  const [corner, setCorner] = useState<ChildCorner | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    api
      .corner(abort.signal)
      .then((result) => {
        if (!abort.signal.aborted) {
          setCorner(result);
          setError("");
        }
      })
      .catch((failure) => {
        if (!abort.signal.aborted) setError(gameplayError(failure));
      });
    return () => abort.abort();
  }, [api, retry]);

  const daysThisWeek = corner?.playedThisWeek.filter(Boolean).length ?? 0;
  const lead = !corner
    ? ""
    : corner.finishedGames === 0
      ? "Chơi xong một trò là con được một nhãn dán đó!"
      : `Con đã chơi xong ${corner.finishedGames} trò. Tuần này con chơi ${daysThisWeek} ngày.`;

  return (
    <main className="ck-main">
      <Link href="/child/games" className="ck-back">
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4 6.5 10l6 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        Bài của con
      </Link>

      <div className="ck-cornerHead">
        <span className="ck-bigAvatar" aria-hidden="true">{name.charAt(0).toUpperCase()}</span>
        <div className="min-w-0">
          <div className="ck-hello">
            <h1 className="ck-helloTitle">Góc của {name}</h1>
            {canSpeak && corner && <SayButton text={`Góc của ${name}. ${lead}`} speak={speak} />}
          </div>
          {corner?.classroom && (
            <p className="ck-helloLead">
              Lớp {corner.classroom.className}
              {corner.classroom.teacherNames.length > 0 && ` · ${corner.classroom.teacherNames.join(", ")}`}
            </p>
          )}
        </div>
      </div>

      {error && (
        <div className="ck-error" role="alert">
          {error}
          <button type="button" className="ck-retry" onClick={() => setRetry((n) => n + 1)}>Thử lại</button>
        </div>
      )}
      {!corner && !error && (
        <div className="ck-stack" role="status" aria-label="Đang mở góc của con">
          <div className="ck-skeleton" />
        </div>
      )}

      {corner && (
        <>
          <section className="ck-section" aria-labelledby="week-heading">
            <h2 id="week-heading" className="ck-sectionTitle">Tuần này</h2>
            <ol className="ck-week" aria-label={`Tuần này con chơi ${daysThisWeek} ngày`}>
              {corner.playedThisWeek.map((played, index) => (
                <li
                  key={weekdays[index]}
                  className="ck-day"
                  data-played={played}
                  data-today={index === corner.todayIndex}
                  data-future={index > corner.todayIndex}
                  aria-label={`${weekdayNames[index]}${index === corner.todayIndex ? ", hôm nay" : ""}: ${played ? "con đã chơi" : "chưa chơi"}`}
                >
                  <span className="ck-dayDot" aria-hidden="true">
                    {played && (
                      <svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 2.8l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6-4.5-4.2 6.1-.8Z" fill="currentColor" /></svg>
                    )}
                  </span>
                  <span className="ck-dayName" aria-hidden="true">{weekdays[index]}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="ck-section" aria-labelledby="stickers-heading">
            <h2 id="stickers-heading" className="ck-sectionTitle">
              Nhãn dán của con
              {corner.finishedGames > 0 && <span className="ck-count">{corner.finishedGames}</span>}
            </h2>
            {corner.stickers.length === 0 ? (
              <div className="ck-empty">
                <svg className="ck-emptyArt" viewBox="0 0 160 160" aria-hidden="true">
                  <circle cx="80" cy="80" r="62" fill="#fff3c4" />
                  <path d="M80 34l13 27 30 4-22 21 5 29-26-14-26 14 5-29-22-21 30-4Z" fill="#ffcd4f" stroke="#e8a91d" strokeWidth="4" strokeLinejoin="round" />
                </svg>
                <p className="ck-emptyTitle">Chưa có nhãn dán</p>
                <p className="ck-emptyText">Chơi xong một trò là con được một nhãn dán.</p>
                <Link href="/child/games" className="ck-ask">Đi chơi thôi</Link>
              </div>
            ) : (
              <ul className="ck-stickers">
                {corner.stickers.map((sticker, index) => (
                  <li
                    key={sticker.versionId}
                    className="ck-sticker"
                    data-type={sticker.gameType}
                    style={{ "--tilt": `${[-4, 3, -2, 5, -3, 2][index % 6]}deg` } as React.CSSProperties}
                    aria-label={`${sticker.title}${sticker.times > 1 ? `, con chơi xong ${sticker.times} lần` : ""}`}
                  >
                    <span className="ck-stickerArt" aria-hidden="true"><GameSymbol type={sticker.gameType} /></span>
                    <span className="ck-stickerName" aria-hidden="true">{sticker.title}</span>
                    {sticker.times > 1 && <span className="ck-stickerTimes" aria-hidden="true">×{sticker.times}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
