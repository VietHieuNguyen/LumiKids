"use client";

import {
  useEffect,
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  gameContentSchema,
  getGameProgress,
  getHintTargets,
  isAnswerInteraction,
  nextHintTarget,
} from "@lumikids/shared";
import type { GameAction, GameContent } from "@lumikids/shared";
import { createGameController } from "./model/controller";
import type { RuntimeCallbacks } from "./model/controller";
import type {
  ResolvedAssetUrls,
  AssetRevisions,
  AssetErrorHandler,
} from "./components/types";
import { gameRegistry } from "./registry";
import { readableGameText } from "./components/display-text";
import type { CSSProperties } from "react";
import { gameSceneTheme, SCENE_BACKGROUNDS } from "./model/backgrounds";
import { GameSymbol } from "./components/game-symbol";
import { GameBackdrop } from "./environment/game-backdrop";
import { GameMusic } from "./components/game-music";
import { CorrectAnswerMascot } from "./components/correct-answer-mascot";
import { GameCompletion } from "./components/game-completion";

export interface GameRuntimeProps extends RuntimeCallbacks {
  content: GameContent;
  assetUrls: ResolvedAssetUrls;
  assetRevisions?: AssetRevisions;
  paused?: boolean;
  mode?: "PREVIEW" | "PLAY";
  /** Start covering the whole window (no browser-fullscreen gesture needed). */
  defaultExpanded?: boolean;
  onAssetError?: AssetErrorHandler;
  onReset?: () => void;
  completionHref?: string;
}

function useGameFullscreen(defaultExpanded: boolean) {
  const target = useRef<HTMLElement>(null);
  const [native, setNative] = useState(false);
  const [expanded, setExpanded] = useState(defaultExpanded);
  useEffect(() => {
    const update = () =>
      setNative(
        document.fullscreenElement !== null &&
          document.fullscreenElement === target.current,
      );
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  useEffect(() => {
    if (!expanded) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [expanded]);
  async function toggle() {
    if (native || expanded) {
      setExpanded(false);
      if (document.fullscreenElement) await document.exitFullscreen();
      return;
    }
    try {
      await target.current?.requestFullscreen?.();
    } catch {
      // Handled below: no element fullscreen means a window-sized overlay.
    }
    if (!document.fullscreenElement) setExpanded(true);
  }
  return { target, active: native || expanded, toggle };
}

function GameRun({
  content,
  assetUrls,
  assetRevisions,
  paused = false,
  mode = "PREVIEW",
  defaultExpanded = false,
  onInteraction,
  onComplete,
  onReset,
  onAssetError,
  completionHref = "/child/games",
}: GameRuntimeProps) {
  const {
    target: fullscreenTarget,
    active: fullscreenActive,
    toggle: toggleFullscreen,
  } = useGameFullscreen(defaultExpanded);
  const [controller] = useState(() => createGameController(content));
  const [mascotEvent, setMascotEvent] = useState<{ id: string; result: "CORRECT" | "INCORRECT" } | null>(null);
  const effectAudio = useRef<HTMLAudioElement | null>(null);
  const mascotResult = useRef<"CORRECT" | "INCORRECT" | null>(null);
  const mascotBusy = useRef(false);
  const dismissMascot = useCallback(() => {
    mascotBusy.current = false;
    effectAudio.current?.pause();
    setMascotEvent(null);
  }, []);
  useLayoutEffect(() => {
    controller.setCallbacks({ onInteraction: (event) => {
      // A hint has no result: no mascot or effect sound, only the light-up on the board.
      if (mode === "PLAY" && isAnswerInteraction(event) && (!mascotBusy.current || mascotResult.current !== event.result)) {
        mascotBusy.current = true;
        mascotResult.current = event.result;
        setMascotEvent({ id: event.eventId, result: event.result });
        effectAudio.current?.pause();
        const sound = new Audio(`/audio/effect/${event.result === "CORRECT" ? "correct" : "incorrect"}.mp3`);
        sound.volume = event.result === "CORRECT" ? 0.55 : 0.4;
        effectAudio.current = sound;
        void sound.play().catch(() => {});
      }
      onInteraction?.(event);
    }, onComplete });
  }, [controller, mode, onInteraction, onComplete]);
  useEffect(() => {
    const stop = () => effectAudio.current?.pause();
    const visibility = () => { if (document.hidden) stop(); };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", stop);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", stop);
      stop();
    };
  }, []);
  const [state, setState] = useState(controller.getState);
  const [round, setRound] = useState(0);
  const headingId = useId();
  const [presentationSeed, setPresentationSeed] = useState(headingId);
  useEffect(() => {
    if (content.gameType !== "MATCHING") return;
    // Client entropy after hydration; keep the same layout across URL renewals/pauses.
    const frame = requestAnimationFrame(() =>
      setPresentationSeed(crypto.randomUUID()),
    );
    return () => cancelAnimationFrame(frame);
  }, [content.gameType]);
  const progress = getGameProgress(content, state);
  const registration = gameRegistry[content.gameType];
  const theme = gameSceneTheme(content.gameType);
  function act(action: GameAction) {
    if (paused) return;
    // Commit synchronously in controller, publish UI outside a React state updater.
    try {
      controller.dispatch(action);
    } finally {
      setState(controller.getState());
    }
  }
  function reset() {
    dismissMascot();
    if (content.gameType === "MATCHING")
      setPresentationSeed(crypto.randomUUID());
    setState(controller.reset());
    setRound((value) => value + 1);
    onReset?.();
  }
  const last = state.lastInteraction;
  const answer = last && isAnswerInteraction(last) ? last : null;
  const hint =
    last?.actionType === "REQUEST_HINT"
      ? (getHintTargets(content).find((target) => target.taskId === last.sourceId) ?? null)
      : null;
  const nextHint = nextHintTarget(content, state);
  const feedback = paused
    ? "loading"
    : state.completed
      ? "complete"
      : hint
        ? "hint"
        : answer?.result === "CORRECT"
          ? "correct"
          : answer
            ? "incorrect"
            : "ready";
  const feedbackStyle = {
    loading: "bg-amber-50 text-amber-900",
    ready: "bg-amber-50 text-amber-900",
    hint: "bg-sky-50 text-sky-900",
    complete: "bg-emerald-50 text-emerald-800",
    correct: "bg-emerald-50 text-emerald-800",
    incorrect: "bg-rose-50 text-rose-800",
  }[feedback];
  const feedbackSymbol = { loading: "◌", ready: "✦", hint: "☀", complete: "★", correct: "✓", incorrect: "↻" }[feedback];
  const feedbackText = {
    loading: "Đang chờ ảnh sẵn sàng để tiếp tục.",
    ready: "Con đã sẵn sàng chưa? Cùng bắt đầu nhé!",
    hint:
      content.gameType === "COUNTING"
        ? "Gợi ý: con đếm lần lượt những hình đang sáng nhé!"
        : content.gameType === "PATTERN"
          ? "Gợi ý: những hình đang sáng lặp lại thành nhịp. Con đọc theo nhịp rồi tìm hình tiếp theo nhé!"
        : "Gợi ý: con nhìn hình đang sáng và nơi đang sáng nhé!",
    complete: "✓ Giỏi lắm! Con đã hoàn thành trò chơi.",
    correct: "✓ Đúng rồi! Con tiếp tục nhé.",
    incorrect: "↻ Chưa đúng rồi. Con thử lại nhé!",
  }[feedback];
  return (
    <section
      ref={fullscreenTarget}
      aria-labelledby={headingId}
      data-game-design="hanging-cards-v1"
      style={
        {
          "--game-scene": `url("${SCENE_BACKGROUNDS[theme]}")`,
        } as CSSProperties
      }
      className={`game-picture-only overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm ${fullscreenActive ? "is-expanded" : ""} ${content.gameType === "CLASSIFICATION" ? "game-runtime-classification" : `game-runtime-playful game-runtime-${content.gameType.toLowerCase()}`}`}
    >
      {mode === "PLAY" && state.completed && <GameCompletion continueHref={completionHref} />}
      {mascotEvent && !state.completed && <CorrectAnswerMascot key={mascotEvent.id} result={mascotEvent.result} onDone={dismissMascot} />}
      <header className="border-b border-slate-100 px-5 py-6 sm:px-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
            {mode === "PREVIEW" ? "Chơi thử" : "Trò chơi"} ·{" "}
            {registration.label}
          </span>
          <button
            type="button"
            className="asset-button-secondary game-hint-button"
            disabled={paused || !nextHint}
            title={nextHint ? "Gợi ý (mỗi câu một lần)" : "Đã dùng hết gợi ý"}
            onClick={() => nextHint && act({ actionType: "REQUEST_HINT", sourceId: nextHint.taskId })}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3Z" />
            </svg>
            <span>{nextHint ? "Gợi ý" : "Hết gợi ý"}</span>
          </button>
          {mode === "PLAY" && <GameMusic gameType={content.gameType} paused={paused} target={fullscreenTarget} />}
          <button
            type="button"
            className="asset-button-secondary"
            aria-label={fullscreenActive ? "Thu nhỏ" : "Toàn màn hình"}
            aria-pressed={fullscreenActive}
            onClick={() => void toggleFullscreen()}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {fullscreenActive ? (
                <path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6" />
              ) : (
                <path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6" />
              )}
            </svg>
            <span className="sr-only">
              {fullscreenActive ? "Thu nhỏ" : "Toàn màn hình"}
            </span>
          </button>
          <button
            type="button"
            className="asset-button-secondary"
            aria-label="Chơi lại"
            onClick={reset}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 10a9 9 0 1 1 1 7M3 4v6h6" />
            </svg>
            <span className="sr-only">Chơi lại</span>
          </button>
        </div>
        <h2
          id={headingId}
          className="text-xl font-bold leading-8 text-slate-900 sm:text-2xl"
        >
          {readableGameText(content.instruction)}
        </h2>
        <div className="mt-5 flex items-center gap-4">
          <span className="game-mode-emblem" aria-hidden="true">
            <GameSymbol type={content.gameType} />
          </span>
          <progress
            aria-label="Tiến độ hoàn thành"
            max={progress.total}
            value={progress.correct}
            className="game-progress h-3 flex-1"
          />
          <span className="game-progress-count text-sm font-semibold text-slate-600">
            {progress.correct}/{progress.total}
          </span>
        </div>
      </header>
      <div className="game-forest-scene" data-scene-theme={theme}>
        <GameBackdrop theme={theme} className="game-forest-canvas" />
        <fieldset
          disabled={paused}
          aria-label="Thao tác trò chơi"
          className="min-w-0 px-5 py-6 sm:px-8 disabled:opacity-60"
          key={`${round}:${paused}`}
        >
          {registration.render({
            presentationSeed,
            content,
            state,
            assetUrls,
            assetRevisions,
            onAction: act,
            onAssetError,
            hint,
          })}
        </fieldset>
      </div>
      <div
        role="status"
        data-feedback={feedback}
        aria-live="polite"
        aria-atomic="true"
        className={`mx-5 mb-6 min-h-16 rounded-2xl px-5 py-4 text-center text-base font-semibold sm:mx-8 ${feedbackStyle}`}
      >
        <span aria-hidden="true" className="game-feedback-symbol">
          {feedbackSymbol}
        </span>
        <span key={state.attemptCount} className="sr-only">
          {feedbackText}
        </span>
      </div>
    </section>
  );
}

export function GameRuntime(props: GameRuntimeProps) {
  const validation = useMemo(
    () => gameContentSchema.safeParse(props.content),
    [props.content],
  );
  if (!validation.success)
    return (
      <p role="alert" className="asset-error">
        Nội dung trò chơi không hợp lệ. Vui lòng kiểm tra schema và đáp án.
      </p>
    );
  // Content changes start a fresh run; changed URL/callback props preserve progress.
  return (
    <GameRun
      key={JSON.stringify(validation.data)}
      {...props}
      content={validation.data}
    />
  );
}
