"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { GameContent } from "@lumikids/shared";
import { duckMusic } from "../model/music-volume";

const tracks: Record<GameContent["gameType"], string> = {
  CLASSIFICATION: "/audio/game/classification.mp3",
  MATCHING: "/audio/game/matching.mp3",
  COUNTING: "/audio/game/counting.mp3",
  // No dedicated track yet: the calm matching loop suits sequence play.
  QUANTITY: "/audio/game/matching.mp3",
  PATTERN: "/audio/game/matching.mp3",
};

/** Child play only: quiet looping music, unlocked by an interaction when autoplay is blocked. */
export function GameMusic({ gameType, paused, target, ducked = false }: {
  gameType: GameContent["gameType"];
  paused: boolean;
  ducked?: boolean;
  target: RefObject<HTMLElement | null>;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const [enabled, setEnabled] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const src = tracks[gameType];

  useEffect(() => {
    if (audio.current) audio.current.volume = 0.22;
  }, []);
  useEffect(() => {
    if (ducked && audio.current) return duckMusic(audio.current);
  }, [ducked]);

  useEffect(() => {
    const player = audio.current;
    return () => { player?.pause(); };
  }, [src]);

  useEffect(() => {
    const player = audio.current;
    const board = target.current;
    if (!player) return;
    function resume() {
      if (player && enabled && !paused && !failed && !document.hidden)
        void player.play().catch(() => { /* A later gesture can unlock browser autoplay. */ });
    }
    function visibility() {
      if (document.hidden) player?.pause();
      else resume();
    }
    function leave() { player?.pause(); }
    function interact(event: Event) {
      // Let the music button handle its own gesture, including keyboard activation.
      if (event.target instanceof Element && event.target.closest("[data-game-music-toggle]")) return;
      resume();
    }
    if (!enabled || paused || failed || document.hidden) player.pause();
    else resume();
    board?.addEventListener("pointerdown", interact);
    board?.addEventListener("keydown", interact);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", leave);
    window.addEventListener("pageshow", visibility);
    return () => {
      board?.removeEventListener("pointerdown", interact);
      board?.removeEventListener("keydown", interact);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("pageshow", visibility);
    };
  }, [enabled, paused, failed, src, target]);

  function toggle() {
    const player = audio.current;
    if (!player || paused || failed) return;
    if (playing) {
      setEnabled(false);
      player.pause();
    } else {
      setEnabled(true);
      // Keep play() directly in the click handler for Safari/iOS gesture requirements.
      void player.play().catch(() => {});
    }
  }

  const label = failed ? "Chưa tải được nhạc nền" : playing ? "Tắt nhạc nền" : "Bật nhạc nền";
  return (
    <>
      <audio ref={audio} src={src} loop preload="none" hidden onPlaying={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => setFailed(true)} />
      <button type="button" className="asset-button-secondary" data-game-music-toggle aria-label={label} title={label} aria-pressed={playing} disabled={paused || failed} onClick={toggle}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M11 5 6 9H3v6h3l5 4V5Z" />
          {playing ? <path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" /> : <path d="m16 9 5 6m0-6-5 6" />}
        </svg>
        <span className="sr-only">{label}</span>
      </button>
    </>
  );
}
