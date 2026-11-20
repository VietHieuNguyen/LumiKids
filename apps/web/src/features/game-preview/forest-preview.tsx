"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getGameProgress, isAnswerInteraction } from "@lumikids/shared";
import type { GameAction, GameInteraction } from "@lumikids/shared";

const resultOf = (event: GameInteraction | null | undefined) =>
  event && isAnswerInteraction(event) ? event.result : undefined;
import { MatchingGame } from "../game-runtime/components/matching-game";
import { createGameController } from "../game-runtime/model/controller";
import { demoAssetUrls, demoContents } from "../game-runtime/demo-content";
import { GameBackdrop } from "../game-runtime/environment/game-backdrop";
import "./forest-preview.css";

const content = demoContents.MATCHING;
const instruction = "Con hãy ghép mỗi con vật với bóng của nó nhé!";

function Icon({ name }: { name: "home" | "reset" | "sound" | "expand" }) {
  return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === "home" ? <path d="m3 11 9-8 9 8M5 10v10h5v-6h4v6h5V10" /> : name === "reset" ? <path d="M4 10a8 8 0 1 1 1 8M4 4v6h6" /> : name === "expand" ? <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" /> : <><path d="M3 9h4l5-5v16l-5-5H3z" /><path d="M16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" /></>}
  </svg>;
}

export function ForestPreview() {
  const root = useRef<HTMLElement>(null);
  const [controller] = useState(() => createGameController(content));
  const [state, setState] = useState(controller.getState);
  const [round, setRound] = useState(0);
  const [sceneStatus, setSceneStatus] = useState("loading");
  const [sound, setSound] = useState(false);
  const [notice, setNotice] = useState("");
  const audio = useRef<AudioContext | null>(null);
  const progress = getGameProgress(content, state);

  useEffect(() => () => { void audio.current?.close(); window.speechSynthesis?.cancel(); }, []);

  function act(action: GameAction) {
    controller.dispatch(action);
    const next = controller.getState();
    setState(next);
    if (sound && audio.current && !document.hidden) {
      const ctx = audio.current;
      void ctx.resume();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(resultOf(next.lastInteraction) === "CORRECT" ? 660 : 330, ctx.currentTime);
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(); oscillator.stop(ctx.currentTime + 0.3);
    }
  }

  function toggleSound() {
    if (sound) { setSound(false); window.speechSynthesis?.cancel(); return; }
    try {
      audio.current ??= new AudioContext();
      void audio.current.resume().catch(() => setNotice("Trình duyệt chưa cho phép phát âm thanh."));
      setSound(true);
      if ("speechSynthesis" in window) {
        const speech = new SpeechSynthesisUtterance(instruction);
        speech.lang = "vi-VN"; speech.rate = 0.85;
        window.speechSynthesis.speak(speech);
      }
    } catch { setNotice("Trình duyệt chưa hỗ trợ âm thanh."); }
  }

  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (root.current?.requestFullscreen) await root.current.requestFullscreen();
      else setNotice("Trò chơi đã hiển thị vừa màn hình của con.");
    } catch { setNotice("Con vẫn có thể chơi ngay trên màn hình này nhé!"); }
  }

  const feedback = state.completed ? "Giỏi lắm! Con tìm đủ các cặp rồi!" : resultOf(state.lastInteraction) === "CORRECT" ? "Đúng rồi! Con tiếp tục nhé!" : state.lastInteraction ? "Gần đúng rồi, con thử bóng khác nhé!" : "Chọn con vật, rồi chạm vào bóng phù hợp";

  return <main ref={root} className="forest-preview" data-scene-status={sceneStatus}>
    <GameBackdrop className="forest-canvas" onStatus={setSceneStatus} />
    <header className="forest-toolbar">
      <Link href="/" className="forest-icon-button" aria-label="Về trang chủ"><Icon name="home" /></Link>
      <div className="forest-brand"><span>Lumi<span>Kids</span></span><small>KHU RỪNG NHỎ</small></div>
      <div className="forest-progress"><span aria-hidden="true">★</span><progress max={progress.total} value={progress.correct} aria-label="Tiến độ ghép bóng" /><b>{progress.correct}/{progress.total}</b></div>
      <button className="forest-icon-button" aria-label="Chơi lại" onClick={() => { setState(controller.reset()); setRound((n) => n + 1); }}><Icon name="reset" /></button>
      <button className="forest-icon-button forest-expand" aria-label="Toàn màn hình" onClick={() => void fullscreen()}><Icon name="expand" /></button>
    </header>
    <div className="forest-heading"><span>CHƠI CÙNG NHỮNG NGƯỜI BẠN</span><h1>Chiếc bóng của ai?</h1><p>{instruction}</p></div>
    <div className="forest-game game-picture-only" aria-label="Trò chơi ghép bóng">
      {state.gameType === "MATCHING" && content.gameType === "MATCHING" && <MatchingGame key={round} content={content} state={state} assetUrls={demoAssetUrls} onAction={act} presentationSeed={`forest-${round}`} />}
    </div>
    <footer className="forest-footer">
      <button className="forest-sound" onClick={toggleSound} aria-pressed={sound}><Icon name="sound" /><span>{sound ? "Tắt âm thanh" : "Bật âm thanh"}</span></button>
      <p role="status" aria-live="polite"><span aria-hidden="true">{state.completed ? "★" : resultOf(state.lastInteraction) === "CORRECT" ? "✓" : "✦"}</span>{notice || feedback}</p>
    </footer>
    {sceneStatus === "fallback" || sceneStatus === "partial" ? <span className="forest-scene-note">{sceneStatus === "fallback" ? "Đang dùng phong cảnh tĩnh" : "Một phần trang trí 3D chưa tải được"}</span> : null}
  </main>;
}
