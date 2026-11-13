"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { gameContentSchema, getGameProgress } from "@lumikids/shared";
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
import { gameBackground } from "./model/backgrounds";
import { GameSymbol } from "./components/game-symbol";

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
}: GameRuntimeProps) {
  const {
    target: fullscreenTarget,
    active: fullscreenActive,
    toggle: toggleFullscreen,
  } = useGameFullscreen(defaultExpanded);
  const [controller] = useState(() => createGameController(content));
  useLayoutEffect(() => {
    controller.setCallbacks({ onInteraction, onComplete });
  }, [controller, onInteraction, onComplete]);
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
    if (content.gameType === "MATCHING")
      setPresentationSeed(crypto.randomUUID());
    setState(controller.reset());
    setRound((value) => value + 1);
    onReset?.();
  }
  const last = state.lastInteraction;
  return (
    <section
      ref={fullscreenTarget}
      aria-labelledby={headingId}
      data-game-design="hanging-cards-v1"
      style={
        {
          "--game-scene": `url("${gameBackground}")`,
        } as CSSProperties
      }
      className={`game-picture-only overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm ${fullscreenActive ? "is-expanded" : ""} ${content.gameType === "CLASSIFICATION" ? "game-runtime-classification" : `game-runtime-playful game-runtime-${content.gameType.toLowerCase()}`}`}
    >
      <header className="border-b border-slate-100 px-5 py-6 sm:px-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
            {mode === "PREVIEW" ? "Chơi thử" : "Trò chơi"} ·{" "}
            {registration.label}
          </span>
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
        })}
      </fieldset>
      <div
        role="status"
        data-feedback={
          paused
            ? "loading"
            : state.completed
              ? "complete"
              : last?.result === "CORRECT"
                ? "correct"
                : last
                  ? "incorrect"
                  : "ready"
        }
        aria-live="polite"
        aria-atomic="true"
        className={`mx-5 mb-6 min-h-16 rounded-2xl px-5 py-4 text-center text-base font-semibold sm:mx-8 ${state.completed || last?.result === "CORRECT" ? "bg-emerald-50 text-emerald-800" : last ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-900"}`}
      >
        <span aria-hidden="true" className="game-feedback-symbol">
          {paused
            ? "◌"
            : state.completed
              ? "★"
              : last?.result === "CORRECT"
                ? "✓"
                : last
                  ? "↻"
                  : "✦"}
        </span>
        <span key={state.attemptCount} className="sr-only">
          {paused
            ? "Đang chờ ảnh sẵn sàng để tiếp tục."
            : state.completed
              ? "✓ Giỏi lắm! Con đã hoàn thành trò chơi."
              : last?.result === "CORRECT"
                ? "✓ Đúng rồi! Con tiếp tục nhé."
                : last
                  ? "↻ Chưa đúng rồi. Con thử lại nhé!"
                  : "Con đã sẵn sàng chưa? Cùng bắt đầu nhé!"}
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
