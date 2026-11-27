"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ChildAssignment, ChildAssignmentGame } from "@lumikids/shared";
import { GameSymbol } from "../game-runtime/components/game-symbol";
import { gameTypeLabels } from "../game-library/library-page";
import type { GameplayApi } from "./api";
import { gameplayError } from "./api";
import { ChildFrame, SayButton, Star } from "./child-frame";
import { deadlineLabel, givenName, progressSentence } from "./child-format";
import { useGameplaySession } from "./use-gameplay-session";
import { useSpeech } from "./use-speech";

export function ChildGamesPage() {
  const { session, loading, api, canPlay, logout } = useGameplaySession();
  if (loading || !session || !api)
    return (
      <ChildFrame>
        <main className="ck-main" role="status" aria-label="Đang mở">
          <div className="ck-skeleton" />
        </main>
      </ChildFrame>
    );
  if (!canPlay)
    return (
      <ChildFrame childName={session.child.fullName} logout={logout}>
        <main className="ck-main"><p className="ck-error">Tài khoản này chưa được phép chơi.</p></main>
      </ChildFrame>
    );
  return (
    <ChildFrame childName={givenName(session.child.fullName)} logout={logout}>
      <ChildHome key={session.child.childId} api={api} name={givenName(session.child.fullName)} />
    </ChildFrame>
  );
}

function ChildHome({ api, name }: { api: GameplayApi; name: string }) {
  const { canSpeak, speak } = useSpeech();
  const [items, setItems] = useState<ChildAssignment[] | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    api
      .assignments(abort.signal)
      .then((result) => {
        if (!abort.signal.aborted) {
          setItems(result);
          setError("");
        }
      })
      .catch((failure) => {
        if (!abort.signal.aborted) setError(gameplayError(failure));
      });
    return () => abort.abort();
  }, [api, retry]);

  const open = items?.filter((item) => item.state === "OPEN" && item.source === "TEACHER") ?? [];
  const home = items?.filter((item) => item.state === "OPEN" && item.source === "GUARDIAN") ?? [];
  const closed = items?.filter((item) => item.state === "CLOSED") ?? [];
  const greeting = `Chào ${name}!`;
  const lead = open.length || home.length ? "Hôm nay mình chơi gì nào?" : "Cùng xem cô giao gì nhé.";

  return (
    <main className="ck-main">
      <div className="ck-hello">
        <div>
          <h1 className="ck-helloTitle">{greeting}</h1>
          <p className="ck-helloLead">{lead}</p>
        </div>
        {canSpeak && <SayButton text={`${greeting} ${lead}`} speak={speak} />}
      </div>

      {error && (
        <div className="ck-error" role="alert">
          <span>{error}</span>
          <button type="button" className="ck-retry" onClick={() => setRetry((n) => n + 1)}>Thử lại</button>
        </div>
      )}

      {!items && !error && (
        <div className="ck-stack" role="status" aria-label="Đang tải bài của con">
          <div className="ck-skeleton" />
          <div className="ck-skeleton" />
        </div>
      )}

      {items && items.length === 0 && <Empty canSpeak={canSpeak} speak={speak} />}

      {open.length > 0 && (
        <section className="ck-section" aria-labelledby="open-heading">
          <h2 id="open-heading" className="ck-sectionTitle">
            <Star filled /> Bài cô giao
          </h2>
          <div className="ck-stack">
            {open.map((item) => (
              <OpenCard key={item.assignmentId} item={item} canSpeak={canSpeak} speak={speak} />
            ))}
          </div>
        </section>
      )}

      {home.length > 0 && (
        <section className="ck-section" aria-labelledby="home-heading">
          <h2 id="home-heading" className="ck-sectionTitle">
            <Star filled /> Bố mẹ chọn
          </h2>
          <div className="ck-stack">
            {home.map((item) => (
              <OpenCard key={item.assignmentId} item={item} canSpeak={canSpeak} speak={speak} />
            ))}
          </div>
        </section>
      )}

      {closed.length > 0 && (
        <section className="ck-section" aria-labelledby="closed-heading">
          <h2 id="closed-heading" className="ck-sectionTitle">Bài đã hết giờ</h2>
          <div className="ck-stack">
            {closed.map((item) => (
              <ClosedCard key={item.assignmentId} item={item} api={api} canSpeak={canSpeak} speak={speak} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function Empty({ canSpeak, speak }: { canSpeak: boolean; speak: (text: string) => void }) {
  const text = "Cô chưa giao bài nào. Con quay lại sau nhé!";
  return (
    <div className="ck-empty">
      <svg className="ck-emptyArt" viewBox="0 0 160 160" aria-hidden="true">
        <circle cx="80" cy="84" r="52" fill="#ffd66b" />
        <circle cx="80" cy="84" r="52" fill="none" stroke="#e8a91d" strokeWidth="4" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
          <rect key={angle} x="77" y="8" width="6" height="16" rx="3" fill="#ffc02e" transform={`rotate(${angle} 80 84)`} />
        ))}
        <path d="M60 80q6-6 12 0M88 80q6-6 12 0" fill="none" stroke="#183829" strokeWidth="4" strokeLinecap="round" />
        <path d="M66 100q14 10 28 0" fill="none" stroke="#183829" strokeWidth="4" strokeLinecap="round" />
        <circle cx="58" cy="94" r="5" fill="#ff9e7a" opacity="0.6" />
        <circle cx="102" cy="94" r="5" fill="#ff9e7a" opacity="0.6" />
      </svg>
      <p className="ck-emptyTitle">Chưa có bài mới</p>
      <p className="ck-emptyText">{text}</p>
      {canSpeak && <SayButton text={text} speak={speak} />}
    </div>
  );
}

function Stars({ games }: { games: ChildAssignmentGame[] }) {
  const done = games.filter((game) => game.completed).length;
  return (
    <span className="ck-stars" role="img" aria-label={progressSentence(done, games.length)}>
      {games.map((game) => (
        <Star key={game.versionId} filled={game.completed} />
      ))}
    </span>
  );
}

function OpenCard({ item, canSpeak, speak }: { item: ChildAssignment; canSpeak: boolean; speak: (text: string) => void }) {
  const [now] = useState(() => new Date());
  const deadline = deadlineLabel(item.playableUntil, now);
  const done = item.games.filter((game) => game.completed).length;
  const allDone = done === item.games.length;
  const sentence = [item.title, progressSentence(done, item.games.length), deadline?.text].filter(Boolean).join(". ");
  return (
    <article className="ck-card" aria-labelledby={`a-${item.assignmentId}`}>
      <div className="ck-cardHead">
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 id={`a-${item.assignmentId}`} className="ck-cardTitle">{item.title}</h3>
          {item.note && <p className="ck-cardNote">{item.note}</p>}
          <div className="ck-meta">
            <Stars games={item.games} />
            {deadline && (
              <span className="ck-chip" data-urgent={deadline.urgent}>
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="7" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M9 5v4l2.5 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                {deadline.text}
              </span>
            )}
          </div>
        </div>
        {canSpeak && <SayButton text={sentence} speak={speak} />}
      </div>
      <ul className="ck-games">
        {item.games.map((game) => (
          <li key={game.versionId}>
            <GameTile assignmentId={item.assignmentId} game={game} />
          </li>
        ))}
      </ul>
      {allDone && (
        <p className="ck-done">
          <Star filled /> Giỏi quá! Con làm xong hết rồi. Con vẫn chơi lại được nhé.
        </p>
      )}
    </article>
  );
}

function GameTile({ assignmentId, game }: { assignmentId: string; game: ChildAssignmentGame }) {
  const inner = (
    <>
      {game.completed && (
        <span className="ck-badge" aria-hidden="true">
          <svg viewBox="0 0 52 52" width="52" height="52">
            <circle cx="26" cy="26" r="23" fill="#ffc02e" stroke="#fff" strokeWidth="4" />
            <path d="M26 13l3.6 7.4 8.1 1.1-5.9 5.6 1.4 8-7.2-3.9-7.2 3.9 1.4-8-5.9-5.6 8.1-1.1Z" fill="#fff" />
          </svg>
        </span>
      )}
      <span className="ck-emblem" aria-hidden="true"><GameSymbol type={game.gameType} /></span>
      <span className="ck-tileName">{game.name}</span>
      <span className="ck-play">
        {game.available ? (
          <>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.8v10.4L12 7Z" fill="currentColor" /></svg>
            {game.completed ? "Chơi lại" : "Chơi"}
          </>
        ) : (
          "Chưa chơi được"
        )}
      </span>
    </>
  );
  const label = `${game.name}, trò ${gameTypeLabels[game.gameType].toLowerCase()}${game.completed ? ", con đã xong" : ""}`;
  if (!game.available)
    return (
      <div className="ck-tile" data-type={game.gameType} data-off="true" aria-label={`${label}, chưa chơi được`}>
        {inner}
      </div>
    );
  return (
    <Link
      className="ck-tile"
      data-type={game.gameType}
      data-done={game.completed}
      href={{ pathname: `/child/games/${game.versionId}`, query: { assignmentId } }}
      aria-label={label}
    >
      {inner}
    </Link>
  );
}

function ClosedCard({ item, api, canSpeak, speak }: { item: ChildAssignment; api: GameplayApi; canSpeak: boolean; speak: (text: string) => void }) {
  const [request, setRequest] = useState(item.replayRequest);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const done = item.games.filter((game) => game.completed).length;
  async function ask() {
    setBusy(true);
    setError("");
    try {
      await api.requestReplay(item.assignmentId);
      setRequest({ status: "PENDING", requestedAt: new Date().toISOString(), grantedUntil: null });
      if (canSpeak) speak("Con đã nhờ cô rồi. Đợi cô đồng ý nhé.");
    } catch (failure) {
      setError(gameplayError(failure));
    } finally {
      setBusy(false);
    }
  }
  const pending = request?.status === "PENDING";
  const rejected = request?.status === "REJECTED";
  return (
    <article className="ck-card ck-closed" aria-labelledby={`c-${item.assignmentId}`}>
      <div className="ck-closedRow">
        <div style={{ display: "flex", gap: 14, alignItems: "center", minWidth: 0, flex: "1 1 260px" }}>
          <span className="ck-moon" aria-hidden="true">
            <svg width="30" height="30" viewBox="0 0 30 30"><path d="M19 4a11 11 0 1 0 7 17A9 9 0 0 1 19 4Z" fill="currentColor" /></svg>
          </span>
          <div style={{ minWidth: 0 }}>
            <h3 id={`c-${item.assignmentId}`} className="ck-cardTitle">{item.title}</h3>
            <div className="ck-meta">
              <Stars games={item.games} />
              <span className="ck-chip" data-urgent="true">Hết giờ chơi</span>
            </div>
          </div>
        </div>
        {item.source === "GUARDIAN" ? (
          <span className="ck-sent">Nhờ bố mẹ chọn lại nhé</span>
        ) : pending ? (
          <span className="ck-sent" role="status">
            <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M4 7l8 6 8-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
            Đã nhờ cô, đợi cô nhé
          </span>
        ) : (
          <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
            {rejected && <span className="ck-sent" data-tone="no">Lần trước cô chưa đồng ý</span>}
            <button type="button" className="ck-ask" onClick={() => void ask()} disabled={busy}>
              <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><path d="M13 22s-8-4.7-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 21 11c0 6.3-8 11-8 11Z" fill="#fff" stroke="#183829" strokeWidth="2" strokeLinejoin="round" /></svg>
              {busy ? "Đang gửi…" : "Xin cô chơi lại"}
            </button>
          </div>
        )}
        {canSpeak && (
          <SayButton
            text={`${item.title}. Bài này đã hết giờ. ${progressSentence(done, item.games.length)} ${item.source === "GUARDIAN" ? "Con nhờ bố mẹ chọn lại nhé." : pending ? "Con đã nhờ cô rồi." : "Con bấm nút vàng để xin cô chơi lại."}`}
            speak={speak}
          />
        )}
      </div>
      {error && <p className="ck-error" role="alert">{error}</p>}
    </article>
  );
}
