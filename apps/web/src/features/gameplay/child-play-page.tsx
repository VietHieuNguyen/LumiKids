"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameInteraction, PlayableGameDetail } from "@lumikids/shared";
import { GamePreview } from "../game-preview/game-preview";
import type { GameplayApi } from "./api";
import { gameplayError } from "./api";
import { createEventOutbox } from "./event-outbox";
import type { EventOutbox, OutboxSnapshot } from "./event-outbox";
import { ChildFrame } from "./child-frame";
import { givenName } from "./child-format";
import { useGameplaySession } from "./use-gameplay-session";

const RESTART_FLUSH_MS = 3000;

export function ChildPlayPage({ assignmentId, versionId }: { assignmentId: string; versionId: string }) {
  const { session, loading, api, canPlay, logout } = useGameplaySession();
  if (loading || !session || !api)
    return (
      <ChildFrame>
        <main className="ck-main" role="status" aria-label="Đang mở trò chơi">
          <div className="ck-skeleton" />
        </main>
      </ChildFrame>
    );
  if (!canPlay)
    return (
      <ChildFrame childName={givenName(session.child.fullName)} logout={logout}>
        <main className="ck-main"><p className="ck-error">Tài khoản này chưa được phép chơi.</p></main>
      </ChildFrame>
    );
  return (
    <ChildFrame childName={givenName(session.child.fullName)} logout={logout}>
      <PlayContent
        key={`${session.child.childId}:${assignmentId}:${versionId}`}
        api={api}
        assignmentId={assignmentId}
        versionId={versionId}
      />
    </ChildFrame>
  );
}

function saveLabel(snapshot: OutboxSnapshot | null, starting: boolean) {
  if (starting || !snapshot) return "Đang chuẩn bị lượt chơi…";
  if (snapshot.state === "failed") return "Chưa lưu được lượt chơi này.";
  if (snapshot.state === "closed") return "Lượt chơi đã kết thúc.";
  if (snapshot.state === "retrying") return "Mất kết nối, đang thử lưu lại…";
  if (snapshot.pending > 0) return "Đang lưu…";
  return snapshot.sessionStatus === "COMPLETED"
    ? "Đã lưu kết quả."
    : "Đã lưu.";
}

function PlayContent({
  api,
  assignmentId,
  versionId,
}: {
  api: GameplayApi;
  assignmentId: string;
  versionId: string;
}) {
  // Token refreshes replace `api`; requests always use the latest one.
  const apiRef = useRef(api);
  useEffect(() => {
    apiRef.current = api;
  }, [api]);
  const [game, setGame] = useState<PlayableGameDetail | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [startRequestId, setStartRequestId] = useState(() =>
    crypto.randomUUID(),
  );
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<OutboxSnapshot | null>(null);
  const outboxRef = useRef<EventOutbox | null>(null);
  const sessionRef = useRef<string | null>(null);
  const ready = game?.versionId === versionId;

  useEffect(() => {
    const abort = new AbortController();
    api
      .detail(versionId, assignmentId, abort.signal)
      .then((value) => {
        if (abort.signal.aborted) return;
        setGame(value);
        setError("");
      })
      .catch((failure) => {
        if (!abort.signal.aborted) setError(gameplayError(failure));
      });
    return () => abort.abort();
  }, [api, assignmentId, versionId, retry]);

  useEffect(() => {
    if (!ready) return;
    const abort = new AbortController();
    // Same startRequestId on a re-run returns the same session (server idempotency).
    apiRef.current
      .start({ assignmentId, versionId, startRequestId }, abort.signal)
      .then((view) => {
        if (abort.signal.aborted || sessionRef.current === view.sessionId)
          return;
        outboxRef.current?.dispose();
        const id = view.sessionId;
        outboxRef.current = createEventOutbox(
          {
            submit: (events) => apiRef.current.submit(id, events),
            sync: () => apiRef.current.session(id),
          },
          setSaveState,
        );
        sessionRef.current = id;
        setSaveState(outboxRef.current.getSnapshot());
        setSessionId(id);
      })
      .catch((failure) => {
        if (!abort.signal.aborted) setError(gameplayError(failure));
      });
    return () => abort.abort();
  }, [ready, assignmentId, versionId, startRequestId, retry]);

  useEffect(() => {
    function leave() {
      const id = sessionRef.current;
      const outbox = outboxRef.current;
      if (!id || !outbox) return;
      if (outbox.getSnapshot().sessionStatus === "IN_PROGRESS")
        apiRef.current.sendOnExit(id, outbox.pending());
    }
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      leave();
      outboxRef.current?.dispose();
      outboxRef.current = null;
      sessionRef.current = null;
    };
  }, []);

  const onInteraction = useCallback((event: GameInteraction) => {
    outboxRef.current?.push(event);
  }, []);
  const onReset = useCallback(() => {
    const outbox = outboxRef.current;
    outboxRef.current = null;
    sessionRef.current = null;
    setSessionId(null);
    setSaveState(null);
    void (async () => {
      if (outbox) {
        // Deliver the old run before the next start abandons that session.
        await Promise.race([
          outbox.flush(),
          new Promise((resolve) => setTimeout(resolve, RESTART_FLUSH_MS)),
        ]);
        outbox.dispose();
      }
      setStartRequestId(crypto.randomUUID());
    })();
  }, []);
  const reader = useMemo(() => api.reader(versionId), [api, versionId]);

  return (
    <main className="ck-play-page">
      <div className="mx-auto max-w-[1600px]">
        {error ? (
          <div role="alert" className="ck-error">
            <span>{error}</span>
            <button
              className="ck-retry"
              onClick={() => {
                setError("");
                setRetry((n) => n + 1);
              }}
            >
              Thử lại
            </button>
            <Link className="ck-exit" href="/child/games">
              ← Bài của con
            </Link>
          </div>
        ) : !game ? (
          <div className="ck-main" role="status" aria-label="Đang mở trò chơi">
            <div className="ck-skeleton" />
          </div>
        ) : (
          <>
            <h1 className="ck-cardTitle mb-4 px-2">{game.name}</h1>
            <GamePreview
              content={game.content}
              assetReader={reader}
              mode="PLAY"
              defaultExpanded
              paused={!sessionId}
              backHref="/child/games"
              backLabel="Bài của con"
              onInteraction={onInteraction}
              onReset={onReset}
            />
            <p
              role="status"
              aria-live="polite"
              className="ck-playStatus"
              data-failed={saveState?.state === "failed"}
            >
              {saveLabel(saveState, !sessionId)}
            </p>
          </>
        )}
      </div>
    </main>
  );
}
