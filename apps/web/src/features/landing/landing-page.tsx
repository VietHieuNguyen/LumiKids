"use client";
/* eslint-disable @next/next/no-img-element -- Small static SVG illustrations and a poster that cross-fades with the WebGL canvas; next/image adds no benefit here. */

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { LumiLogo, LumiWordmark } from "@/components/lumi-logo";
import { useSiteSettings } from "@/components/site-settings-provider";
import type { GameType } from "@lumikids/shared";
import { STORY } from "./camera-path";
import { ValleyAudio, audioSupported } from "./landing-audio";
import { LANDING_ASSETS } from "./landing-assets";
import type { CharacterId } from "./landing-assets";
import { GAME_CARD_TYPES, HOTSPOTS, LANDING_COPY } from "./landing-copy";
import { loginHref } from "@/lib/safe-return-path";
import { clamp, easeInOutCubic, seg, smooth } from "./scroll-math";
import type { FriendId, ValleyStage } from "./valley-scene";
import "./landing.css";

type StageMode = "loading" | "live" | "static";

/** The game runtime is only downloaded when a visitor opens a sample game. */
const LandingDemo = dynamic(() => import("./landing-demo"), { ssr: false });

/** The five kinds of animal to find in the valley, in the order their dots are shown. */
const QUEST: readonly FriendId[] = ["duck", "frog", "deer", "elephant", "rabbit", "bear", "dog"];
type NavTarget = (typeof LANDING_COPY.nav.links)[number]["target"];

/** Scroll progress that each nav target lands on inside the pinned story. */
const NAV_PROGRESS: Record<Exclude<NavTarget, "games">, number> = { explore: 0.41, teacher: 0.61 };
const CHARACTER_IDS: readonly CharacterId[] = ["rabbit", "bear"];
/** Hotspots are clickable only while Rabbit and Bear are framed. */
const INTERACTION_ZONE = [STORY.charactersHold[0], 0.48] as const;

/**
 * WebGL that is actually hardware accelerated. Browsers on some Linux/driver setups silently fall back to a
 * CPU rasteriser (SwiftShader, llvmpipe), which renders the valley at a few frames per second; those get the
 * static poster version instead of a stuttering, blurry scene.
 */
function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return false;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return !/swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer);
  } catch {
    return false;
  }
}

function setLayer(el: HTMLElement | null, opacity: number, transform: string, blur = 0): void {
  if (!el) return;
  const visible = opacity > 0.002;
  el.style.opacity = visible ? opacity.toFixed(3) : "0";
  el.style.transform = transform;
  el.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : "none";
  if (el.dataset.visible !== String(visible)) {
    el.dataset.visible = String(visible);
    el.style.visibility = visible ? "visible" : "hidden";
    el.inert = !visible;
  }
}

function ArrowIcon() {
  return (
    <svg className="lk-arrow" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <circle cx="10" cy="7" r="3.2" />
      <path d="M3.8 16.6c1.2-2.9 3.5-4.3 6.2-4.3s5 1.4 6.2 4.3" />
    </svg>
  );
}

function SoundIcon({ on }: { on: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 6.8h2.6L9 3.6v10.8l-3.9-3.2H2.5z" fill="currentColor" stroke="none" />
      {on
        ? <><path d="M11.6 6.6a3.2 3.2 0 0 1 0 4.8" /><path d="M13.7 4.6a6 6 0 0 1 0 8.8" /></>
        : <path d="m11.8 6.8 4 4.4m0-4.4-4 4.4" />}
    </svg>
  );
}

/** Average frame time (ms) that still counts as unusable once quality is at its floor (~20 fps). */
const FALLBACK_FRAME_MS = 50;
const FALLBACK_KEY = "lumikids.landing.static";

/** A device that already fell back this browser session starts on the poster instead of struggling again. */
function rememberedFallback(): boolean {
  try {
    return window.sessionStorage.getItem(FALLBACK_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberFallback(): void {
  try {
    window.sessionStorage.setItem(FALLBACK_KEY, "1");
  } catch {
    // Storage blocked (private mode): the next visit simply tries 3D again.
  }
}

function MiniActivity({ kind }: { kind: "shadow" | "count" }) {
  const [answer, setAnswer] = useState<string | null>(null);
  const assets = LANDING_ASSETS.gameImages;
  const correct = kind === "shadow" ? "cat" : "3";
  const options = kind === "shadow"
    ? [{ id: "dog", label: "Bóng thứ nhất", src: assets.shadowMatch.other }, { id: "cat", label: "Bóng thứ hai", src: assets.shadowMatch.shadow }]
    : [{ id: "2", label: "2" }, { id: "3", label: "3" }, { id: "4", label: "4" }];
  const feedback = answer === null ? "" : answer === correct ? "Đúng rồi! Bé giỏi quá." : "Chưa đúng, thử lại nhé.";

  return (
    <div className="lk-mini">
      <div className="lk-miniBoard" aria-hidden="true">
        {kind === "shadow"
          ? <img src={assets.shadowMatch.subject} alt="" width={64} height={64} />
          : <div className="lk-basket">{[0, 1, 2].map((i) => <img key={i} src={assets.counting.item} alt="" width={30} height={30} />)}</div>}
      </div>
      <div className="lk-miniChoices" role="group" aria-label="Chọn đáp án">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className="lk-miniChoice"
            data-state={answer === option.id ? (option.id === correct ? "correct" : "wrong") : undefined}
            aria-pressed={answer === option.id}
            onClick={() => setAnswer(option.id)}
          >
            {"src" in option ? <img src={option.src} alt={option.label} width={44} height={44} /> : option.label}
          </button>
        ))}
      </div>
      <p className="lk-miniFeedback" role="status" aria-live="polite">{feedback}</p>
    </div>
  );
}

export function LandingPage() {
  const { siteName, tagline: siteTagline } = useSiteSettings().settings;
  const rootRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const storyRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const summitRef = useRef<HTMLDivElement>(null);
  const farewellRef = useRef<HTMLDivElement>(null);
  const endScrimRef = useRef<HTMLDivElement>(null);
  const duskRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const guideRef = useRef<HTMLDivElement>(null);
  const encounterRef = useRef<HTMLDivElement>(null);
  const teacherRef = useRef<HTMLDivElement>(null);
  const teacherScrimRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLSpanElement>(null);
  const pinRefs = useRef<Record<CharacterId, HTMLDivElement | null>>({ rabbit: null, bear: null });
  const cardRefs = useRef<Record<CharacterId, HTMLDivElement | null>>({ rabbit: null, bear: null });
  const stepRefs = useRef<(HTMLLIElement | null)[]>([]);
  const typedRef = useRef<HTMLSpanElement>(null);
  const progressValue = useRef(0);
  const openCardRef = useRef<CharacterId | null>(null);
  const sayRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<ValleyAudio | null>(null);
  const soundOnRef = useRef(false);

  const [mode, setMode] = useState<StageMode>("loading");
  const [ready, setReady] = useState(false);
  const [openCard, setOpenCard] = useState<CharacterId | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [missing, setMissing] = useState<CharacterId[]>([]);
  const [soundOn, setSoundOn] = useState(false);
  const [canSound, setCanSound] = useState(false);
  const [found, setFound] = useState<readonly FriendId[]>([]);
  const [demo, setDemo] = useState<GameType | null>(null);

  useEffect(() => { openCardRef.current = openCard; }, [openCard]);

  const closeCard = useCallback((returnFocus: boolean) => {
    const current = openCardRef.current;
    if (!current) return;
    setOpenCard(null);
    if (returnFocus) pinRefs.current[current]?.querySelector("button")?.focus();
  }, []);

  // Story controller: one rAF loop drives the camera and every overlay layer.
  useEffect(() => {
    const story = storyRef.current;
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!story || !stage || !canvas) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const staticMode = reduceMotion.matches || !supportsWebGL() || rememberedFallback();
    let disposed = false;
    // Mode is only knowable in the browser; commit it after the effect instead of during it.
    queueMicrotask(() => {
      if (disposed) return;
      setMode(staticMode ? "static" : "live");
      setCanSound(!staticMode && audioSupported());
    });
    if (staticMode) return () => { disposed = true; };

    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const nav = navigator as Navigator & { deviceMemory?: number };
    // WebKit on iPhone/iPad always reports 2 cores (and no deviceMemory), so the core count says nothing
    // there; trusting it rendered iPads at 1.25x on a 2x screen, which looked smeared toward the corners.
    const appleTouch = /iPad|iPhone|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
    const lowPower = (!appleTouch && (nav.hardwareConcurrency ?? 8) <= 4) || (nav.deviceMemory ?? 8) <= 4;

    let valley: ValleyStage | null = null;
    let raf = 0;
    let running = false;
    let inView = true;
    let last = performance.now();
    let pCam = 0;
    let storyTop = 0;
    let travel = 1;
    let pointerX = 0;
    let pointerY = 0;
    let smoothX = 0;
    let smoothY = 0;
    let firstFrame = false;
    // Adaptive resolution: start near the screen's density and step down in small notches while frames
    // stay slow, so a busy GPU gets a slightly softer image instead of a stutter (or one big drop to 1x).
    let dprLimit = Infinity;
    let warm = false;
    let windowFrames = 0;
    let windowTime = 0;
    let degraded = false;
    let settled = false;
    let stepFrom: { dpr: number; average: number } | null = null;
    // Still too slow after every quality step (or the GPU dropped the context): swap the 3D for the poster.
    let slowWindows = 0;
    let fellBack = false;
    let width = 0;
    let height = 0;

    const measure = () => {
      const rect = story.getBoundingClientRect();
      storyTop = rect.top + window.scrollY;
      travel = Math.max(1, story.offsetHeight - stage.offsetHeight);
      width = stage.clientWidth;
      height = stage.clientHeight;
      const desktop = width > 1100;
      // Render at (close to) the screen's real density so edges and foliage stay crisp; the FPS guard lowers it if needed.
      // Tablets and phones are held close, so they get the full 2x of their panel.
      const cap = lowPower ? 1.25 : desktop && finePointer ? 1.75 : 2;
      valley?.resize(width, height, Math.max(1, Math.min(window.devicePixelRatio || 1, cap, dprLimit)), width > 820);
    };

    const rawProgress = () => clamp((window.scrollY - storyTop) / travel);

    const frame = (now: number) => {
      raf = 0;
      if (!running) return;
      const dt = Math.min(64, now - last);
      last = now;

      const p = rawProgress();
      const alpha = 1 - Math.exp(-dt / 105);
      pCam += (p - pCam) * alpha;
      if (Math.abs(p - pCam) < 0.0002) pCam = p;
      progressValue.current = pCam;

      const parallaxOn = finePointer && width > 1100 && pCam < 0.07;
      const damp = parallaxOn ? 1 - seg(pCam, 0.03, 0.07) : 0;
      smoothX += (pointerX * damp - smoothX) * 0.06;
      smoothY += (pointerY * damp - smoothY) * 0.06;

      if (valley) {
        valley.render(pCam, now / 1000, smoothX * 8, smoothY * 5, true);
        if (!firstFrame) {
          firstFrame = true;
          setReady(true);
        }
        // Adaptive quality: every ~45 frames, if the average frame is slower than ~45 fps, lower the
        // render resolution by one notch; at 1x, drop shadows and fine terrain detail as the last step.
        if (warm) {
          windowFrames += 1;
          windowTime += dt;
          if (windowFrames >= 45) {
            const average = windowTime / windowFrames;
            if (stepFrom !== null) {
              // The last notch did not speed frames up (iOS Low Power Mode caps rAF at 30 fps, a scroll burst
              // stalls a few frames): resolution is not the bottleneck, so restore it and stop lowering.
              if (average > stepFrom.average * 0.9) {
                dprLimit = stepFrom.dpr;
                settled = true;
                measure();
              }
              stepFrom = null;
            } else if (!settled && average > 22) {
              const current = valley.pixelRatio();
              if (current > 1.01) {
                stepFrom = { dpr: current, average };
                dprLimit = Math.max(1, current - 0.25);
                measure();
              } else if (!degraded) {
                degraded = true;
                valley.degrade();
              }
            }
            // Nothing left to lower (or lowering did not help) and frames still crawl below ~20 fps:
            // two such windows in a row and the device gets the static poster story instead.
            if ((degraded || settled) && average > FALLBACK_FRAME_MS) {
              slowWindows += 1;
              if (slowWindows >= 2) fallBack("slow");
            } else {
              slowWindows = 0;
            }
            windowFrames = 0;
            windowTime = 0;
          }
        }
      }
      applyLayers(pCam);
      if (soundOnRef.current) audioRef.current?.setProgress(pCam);
      if (running) raf = requestAnimationFrame(frame);
    };

    const applyLayers = (p: number) => {
      const progress = p;
      const heroOut = smooth(seg(p, 0.033, 0.086));
      setLayer(heroRef.current, 1 - heroOut, `translate3d(${(-smoothX * 6).toFixed(2)}px, ${(-heroOut * 48).toFixed(2)}px, 0)`, heroOut * 6);
      setLayer(hintRef.current, 1 - smooth(seg(p, 0.01, 0.033)), "none");

      // Pond caption: in as the camera settles on the pond, out as it pans to the elephant bank.
      const gIn = smooth(seg(p, 0.115, STORY.pondHold[0]));
      const gOut = smooth(seg(p, STORY.pondHold[1] - 0.004, STORY.elephantHold[0] - 0.005));
      setLayer(guideRef.current, gIn * (1 - gOut), `translate3d(0, ${((1 - gIn) * 22 - gOut * 24).toFixed(2)}px, 0)`, (1 - gIn) * 6 + gOut * 4);

      const pinsOut = smooth(seg(p, STORY.charactersHold[1], 0.495));
      const encounterIn = smooth(seg(p, 0.325, STORY.charactersHold[0]));
      // Hotspots fade in during the approach and only arm once the characters are framed.
      const armed = p >= INTERACTION_ZONE[0] && p <= INTERACTION_ZONE[1];
      setLayer(encounterRef.current, encounterIn * (1 - pinsOut), `translate3d(0, ${((1 - encounterIn) * 18).toFixed(2)}px, 0)`);
      const anchors: Partial<Record<CharacterId, { x: number; y: number }>> = {};
      CHARACTER_IDS.forEach((id, index) => {
        const pin = pinRefs.current[id];
        if (!pin) return;
        const pinIn = smooth(seg(p, 0.315 + index * 0.012, 0.348 + index * 0.012));
        const anchor = valley?.anchor(id);
        let opacity = pinIn * (1 - pinsOut);
        if (!anchor || !anchor.visible) opacity = 0;
        let x = anchor?.x ?? 0;
        let y = anchor?.y ?? 0;
        const other = anchors.rabbit;
        if (id === "bear" && other && Math.abs(other.x - x) < 150 && Math.abs(other.y - y) < 56) y = other.y - 60;
        anchors[id] = { x, y };
        x = clamp(x, 70, width - 70);
        y = clamp(y, 110, height - 90);
        pin.style.setProperty("--pin-x", `${x.toFixed(1)}px`);
        pin.style.setProperty("--pin-y", `${y.toFixed(1)}px`);
        pin.dataset.side = x > width * 0.55 ? "left" : "right";
        setLayer(pin, opacity, `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%) scale(${(0.85 + 0.15 * pinIn).toFixed(3)})`);
        const live = armed && opacity > 0.002;
        if (pin.dataset.armed !== String(live)) {
          pin.dataset.armed = String(live);
          pin.inert = !live;
        }
        const card = cardRefs.current[id];
        // Desktop popover sits beside its character, on the side with open space, so it never covers them.
        // The mobile stylesheet turns it into a bottom sheet instead.
        if (card && openCardRef.current === id) {
          const toLeft = x > width * 0.5;
          const cardX = clamp(toLeft ? x - 96 - 296 : x + 96, 16, width - 312);
          const cardY = clamp(y - 24, 96, height - card.offsetHeight - 40);
          card.style.transform = `translate3d(${cardX.toFixed(1)}px, ${cardY.toFixed(1)}px, 0)`;
        }
      });

      const tIn = easeInOutCubic(seg(p, 0.475, 0.528)) * (1 - smooth(seg(progress, 0.675, 0.705)));
      // The same left-side scrim keeps hero copy readable where the valley reaches behind it (tablet widths).
      const heroScrim = (1 - heroOut) * (width <= 1100 ? 0.9 : 0.45);
      if (teacherScrimRef.current) teacherScrimRef.current.style.opacity = Math.max(tIn, heroScrim).toFixed(3);
      setLayer(teacherRef.current, tIn, `translate3d(0, ${((1 - tIn) * 28).toFixed(2)}px, 0)`);
      stepRefs.current.forEach((step, index) => {
        if (!step) return;
        const k = smooth(seg(p, 0.495 + index * 0.0165, 0.521 + index * 0.0165));
        step.style.opacity = k.toFixed(3);
        step.style.transform = `translate3d(${((1 - k) * 18).toFixed(2)}px, 0, 0)`;
      });
      if (typedRef.current) {
        const text = LANDING_COPY.teacher.examplePrompt;
        const count = Math.round(text.length * seg(p, 0.488, STORY.cabinHold[0]));
        if (typedRef.current.dataset.count !== String(count)) {
          typedRef.current.dataset.count = String(count);
          typedRef.current.textContent = text.slice(0, count);
        }
      }

      const sIn = smooth(seg(progress, 0.765, 0.795)) * (1 - smooth(seg(progress, 0.845, 0.875)));
      setLayer(summitRef.current, sIn, `translate3d(0, ${((1 - sIn) * 24).toFixed(2)}px, 0)`, (1 - sIn) * 6);
      // Farewell copy and CTA once the wide sunset shot has settled.
      const fIn = smooth(seg(progress, STORY.farewellHold[0] - 0.008, STORY.farewellHold[0] + 0.02));
      setLayer(farewellRef.current, fIn, `translate3d(0, ${((1 - fIn) * 24).toFixed(2)}px, 0)`, (1 - fIn) * 6);
      if (endScrimRef.current) endScrimRef.current.style.opacity = Math.max(sIn, fIn).toFixed(3);
      if (duskRef.current) duskRef.current.style.opacity = smooth(seg(progress, STORY.duskStart, STORY.farewellHold[0])).toFixed(3);

      if (progressRef.current) progressRef.current.style.transform = `scaleX(${progress.toFixed(4)})`;
      const solid = window.scrollY > 24 && (p > 0.09 || window.scrollY > storyTop + travel);
      if (navRef.current && navRef.current.dataset.solid !== String(solid)) navRef.current.dataset.solid = String(solid);

      if (openCardRef.current && (progress < INTERACTION_ZONE[0] || progress > INTERACTION_ZONE[1])) {
        const active = document.activeElement;
        const openId = openCardRef.current;
        const focusInside = active instanceof HTMLElement && Boolean(pinRefs.current[openId]?.contains(active) || cardRefs.current[openId]?.contains(active));
        setOpenCard(null);
        if (focusInside) stageRef.current?.focus({ preventScroll: true });
      }
    };

    const start = () => {
      if (running || disposed || fellBack || !inView || document.hidden) return;
      running = true;
      last = performance.now();
      // Re-entering: jump straight to the current scroll position instead of easing from stale state.
      pCam = rawProgress();
      raf = requestAnimationFrame(frame);
      if (soundOnRef.current) void audioRef.current?.start();
    };
    const stop = () => {
      running = false;
      // The valley left the screen or the tab was hidden: no water or birds over the rest of the page.
      audioRef.current?.stop();
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    const fallBack = (reason: "slow" | "context-lost" | "load-failed") => {
      if (fellBack || disposed) return;
      fellBack = true;
      console.warn(`[LumiKids landing] Chuyển sang ảnh tĩnh (${reason}).`);
      const progress = rawProgress();
      stop();
      valley?.dispose();
      valley = null;
      if (reason !== "load-failed") rememberFallback();
      stage.style.cursor = "";
      setReady(false);
      setCanSound(false);
      setMode("static");
      // The static story is much shorter; keep the visitor at the same point of it instead of jumping.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (disposed || progress <= 0) return;
        const top = story.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({ top: top + progress * Math.max(0, story.offsetHeight - window.innerHeight), behavior: "auto" });
      }));
    };
    const onContextLost = (event: Event) => {
      event.preventDefault();
      fallBack("context-lost");
    };

    const onPointer = (event: PointerEvent) => {
      pointerX = event.clientX / window.innerWidth - 0.5;
      pointerY = event.clientY / window.innerHeight - 0.5;
      if (!finePointer || !valley) return;
      // A hand cursor over any animal that can be tapped (not over buttons, links or an open card).
      const overUi = event.target instanceof Element && event.target.closest("a, button, .lk-card");
      const rect = stage.getBoundingClientRect();
      const friend = overUi ? null : valley.friendAt(event.clientX - rect.left, event.clientY - rect.top);
      const cursor = friend ? "pointer" : "";
      if (stage.style.cursor !== cursor) stage.style.cursor = cursor;
    };
    // Tap an animal: it hops, says hello in a little bubble and, with sound on, calls out.
    const onStageClick = (event: MouseEvent) => {
      if (!valley || !(event.target instanceof Element) || event.target.closest("a, button, .lk-card")) return;
      const rect = stage.getBoundingClientRect();
      const hit = valley.poke(event.clientX - rect.left, event.clientY - rect.top);
      if (!hit) return;
      if (soundOnRef.current) audioRef.current?.voice(hit.id);
      setFound((current) => (current.includes(hit.id) ? current : [...current, hit.id]));
      const bubble = sayRef.current;
      if (!bubble) return;
      bubble.textContent = LANDING_COPY.friends[hit.id];
      bubble.style.left = `${clamp(hit.x, 70, width - 70).toFixed(1)}px`;
      bubble.style.top = `${clamp(hit.y, 120, height - 60).toFixed(1)}px`;
      // Restart the pop animation even when the same animal is tapped again.
      bubble.dataset.show = "false";
      void bubble.offsetWidth;
      bubble.dataset.show = "true";
    };
    const onLeave = () => { pointerX = 0; pointerY = 0; };
    const onVisibility = () => (document.hidden ? stop() : start());
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      if (inView) start(); else stop();
    });
    const resizeObserver = new ResizeObserver(() => measure());

    void (async () => {
      try {
        const { ValleyStage: Stage } = await import("./valley-scene");
        if (disposed) return;
        valley = new Stage(canvas, lowPower ? "low" : "high");
        measure();
        const result = await valley.load(() => {
          measure();
        });
        if (disposed) return;
        await valley.warmUp();
        if (disposed) return;
        // Judge speed only after loading and shader compiles, which are one-off costs.
        window.setTimeout(() => { warm = true; }, 600);
        setMissing(CHARACTER_IDS.filter((id) => !valley?.hasCharacter(id)));
        if (result.missing.length) console.warn("[LumiKids landing] Thiếu mô hình:", result.missing.join(", "));
        const debug = new URLSearchParams(window.location.search).has("debug");
        if (debug) (window as unknown as { __lumi?: unknown }).__lumi = { describe: () => valley?.describe(), sample: (p: number) => valley?.sample(p), progress: () => progressValue.current, ready: () => firstFrame };
      } catch (error) {
        console.error(`[LumiKids landing] Không tải được thung lũng 3D: ${LANDING_ASSETS.valley}`, error);
        if (!disposed) fallBack("load-failed");
      }
    })();

    measure();
    observer.observe(stage);
    resizeObserver.observe(stage);
    resizeObserver.observe(story);
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    window.addEventListener("pointermove", onPointer, { passive: true });
    stage.addEventListener("click", onStageClick);
    canvas.addEventListener("webglcontextlost", onContextLost);
    document.documentElement.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", onVisibility);
    void document.fonts?.ready.then(measure);
    start();

    return () => {
      disposed = true;
      stop();
      observer.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
      window.removeEventListener("pointermove", onPointer);
      stage.removeEventListener("click", onStageClick);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      audioRef.current?.dispose();
      audioRef.current = null;
      document.documentElement.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      valley?.dispose();
    };
  }, []);

  // The nav CTA reads "skip" until the games section reaches the middle of the screen.
  useEffect(() => {
    const games = document.getElementById("tro-choi");
    const nav = navRef.current;
    if (!games || !nav) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const inStory = String(games.getBoundingClientRect().top > window.innerHeight * 0.5);
      if (nav.dataset.story !== inStory) nav.dataset.story = inStory;
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  // Escape closes the open card (returning focus to its pin) and the mobile menu.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (openCardRef.current) closeCard(true);
      setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeCard]);

  // Sound is off until asked for; the audio context has to be created from this click.
  const toggleSound = useCallback(() => {
    const next = !soundOnRef.current;
    if (next) {
      try {
        audioRef.current ??= new ValleyAudio();
        audioRef.current.setProgress(progressValue.current);
        void audioRef.current.start();
      } catch {
        return;
      }
    } else {
      audioRef.current?.stop();
    }
    soundOnRef.current = next;
    setSoundOn(next);
  }, []);

  const goTo = (target: NavTarget) => (event: ReactMouseEvent<HTMLAnchorElement>) => {
    setMenuOpen(false);
    const behavior: ScrollBehavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    if (target === "games" || mode === "static") {
      const id = target === "games" ? "tro-choi" : target === "teacher" ? "giao-vien" : "kham-pha";
      const el = document.getElementById(id);
      if (!el) return;
      event.preventDefault();
      el.scrollIntoView({ behavior });
      return;
    }
    const story = storyRef.current;
    const stage = stageRef.current;
    if (!story || !stage) return;
    event.preventDefault();
    const top = story.getBoundingClientRect().top + window.scrollY;
    const travel = story.offsetHeight - stage.offsetHeight;
    window.scrollTo({ top: top + travel * NAV_PROGRESS[target], behavior });
  };

  const rootStyle = { "--poster": `url(${LANDING_ASSETS.poster})` } as CSSProperties;

  return (
    <div ref={rootRef} className="lk-root" data-mode={mode} data-ready={ready} style={rootStyle}>
      <a className="lk-skip" href="#tro-choi">Bỏ qua phần giới thiệu</a>

      <header ref={navRef} className="lk-nav" data-solid="false" data-story="true" data-menu={menuOpen}>
        <a className="lk-brand" href="#" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }} aria-label="LumiKids — về đầu trang">
          <LumiLogo size={28} />
          <LumiWordmark />
        </a>
        <nav className="lk-navLinks" aria-label="Điều hướng chính">
          {LANDING_COPY.nav.links.map((link) => (
            <a key={link.href} href={link.href} onClick={goTo(link.target)}>{link.label}</a>
          ))}
          <a href="#phu-huynh">{LANDING_COPY.nav.family}</a>
        </nav>
        <div className="lk-navRight">
          <Link className="lk-navLogin lk-navChild" href="/login?mode=child">{LANDING_COPY.nav.child}</Link>
          <Link className="lk-navLogin" href="/login">{LANDING_COPY.nav.login}</Link>
          <Link className="lk-navLoginIcon" href="/login" aria-label={LANDING_COPY.nav.login}><UserIcon /></Link>
          {/* One button, two jobs: inside the valley story it skips to the games; afterwards it is the usual CTA. */}
          <a className="lk-cta lk-navCta" href="#tro-choi" onClick={goTo("games")}>
            <span className="lk-ctaLong lk-whenStory">{LANDING_COPY.nav.skip}</span>
            <span className="lk-ctaShort lk-whenStory">{LANDING_COPY.nav.skipShort}</span>
            <span className="lk-ctaLong lk-whenAfter">{LANDING_COPY.nav.cta}</span>
            <span className="lk-ctaShort lk-whenAfter">{LANDING_COPY.nav.ctaShort}</span>
            <ArrowIcon />
          </a>
          <button
            type="button"
            className="lk-menuButton"
            aria-expanded={menuOpen}
            aria-controls="landing-menu"
            aria-label={menuOpen ? "Đóng menu" : "Mở menu"}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span /><span />
          </button>
        </div>
        <div id="landing-menu" className="lk-drawer" hidden={!menuOpen}>
          {LANDING_COPY.nav.links.map((link) => (
            <a key={link.href} href={link.href} onClick={goTo(link.target)}>{link.label}</a>
          ))}
          <a href="#phu-huynh" onClick={() => setMenuOpen(false)}>{LANDING_COPY.nav.family}</a>
          <Link href="/login?mode=child" onClick={() => setMenuOpen(false)}>{LANDING_COPY.nav.child}</Link>
          <Link href="/login" onClick={() => setMenuOpen(false)}>{LANDING_COPY.nav.login}</Link>
        </div>
      </header>

      <main>
        <section ref={storyRef} id="kham-pha" className="lk-story" aria-label="Hành trình vào thung lũng LumiKids">
          <div ref={stageRef} className="lk-stage" tabIndex={-1}>
            <div className="lk-sky" aria-hidden="true" />
            <div ref={duskRef} className="lk-dusk" aria-hidden="true" />
            <img className="lk-poster" src={LANDING_ASSETS.poster} alt="" aria-hidden="true" onError={(e) => { e.currentTarget.hidden = true; }} />
            {/* Sky haze sits behind the transparent canvas so it softens the sky only, never the scene's corners. */}
            <div className="lk-mist" aria-hidden="true" />
            <canvas ref={canvasRef} className="lk-canvas" aria-hidden="true" />
            <div ref={teacherScrimRef} className="lk-teacherScrim" aria-hidden="true" />
            <div ref={endScrimRef} className="lk-endScrim" aria-hidden="true" />

            <div ref={heroRef} className={`lk-layer lk-hero`}>
              <p className="lk-eyebrow">{LANDING_COPY.hero.eyebrow}</p>
              <h1 className="lk-heroTitle">
                {LANDING_COPY.hero.titleLines.map((line, index) => (
                  <span key={line} className="lk-heroLine">
                    <span style={{ animationDelay: `${index * 90}ms` }}>{line}</span>
                  </span>
                ))}
              </h1>
              <p className="lk-heroSubtitle">{LANDING_COPY.hero.subtitle}</p>
              <a className={`lk-cta lk-ctaLarge`} href="#tro-choi" onClick={goTo("games")}>
                {LANDING_COPY.hero.cta}<ArrowIcon />
              </a>
            </div>

            <div ref={hintRef} className={`lk-layer lk-hint`} aria-hidden="true">
              <span className="lk-hintDot"><svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg></span>
              {LANDING_COPY.hero.scrollHint}
            </div>

            <div ref={guideRef} className={`lk-layer lk-guide`}>
              <p className="lk-guideTitle">{LANDING_COPY.guide}</p>
              <p className="lk-guideNote">{LANDING_COPY.guideNote}</p>
            </div>

            <div ref={encounterRef} className={`lk-layer lk-encounter`}>
              <p className="lk-eyebrow">{LANDING_COPY.encounter.caption}</p>
            </div>

            {CHARACTER_IDS.map((id) => {
              const content = HOTSPOTS[id];
              const open = openCard === id;
              return (
                <Fragment key={id}>
                  <div ref={(el) => { pinRefs.current[id] = el; }} className="lk-pin" data-open={open} data-missing={missing.includes(id)}>
                    <button
                      type="button"
                      className="lk-pinButton"
                      aria-expanded={open}
                      aria-controls={`hotspot-${id}`}
                      onClick={() => setOpenCard(open ? null : id)}
                    >
                      <span className="lk-pinDot" aria-hidden="true" />
                      {content.pin}
                      <svg className="lk-chevron" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                    </button>
                  </div>
                  <div ref={(el) => { cardRefs.current[id] = el; }} id={`hotspot-${id}`} className="lk-card" role="region" aria-label={content.title} hidden={!open}>
                    <h3>{content.title}</h3>
                    <p>{content.body}</p>
                    <p className="lk-cardQuestion">{content.question}</p>
                    {open ? <MiniActivity kind={content.kind} /> : null}
                    <button type="button" className="lk-cardClose" onClick={() => closeCard(true)}>Đóng</button>
                  </div>
                </Fragment>
              );
            })}

            <div ref={teacherRef} id="giao-vien" className={`lk-layer lk-teacher`}>
              <p className="lk-eyebrow">{LANDING_COPY.teacher.eyebrow}</p>
              <h2 className="lk-teacherTitle">{LANDING_COPY.teacher.title}</h2>
              <p className="lk-teacherSubtitle">{LANDING_COPY.teacher.subtitle}</p>
              <div className="lk-flowCard">
                <p className="lk-flowLabel">{LANDING_COPY.teacher.exampleLabel}</p>
                <p className="lk-prompt">
                  <span className="lk-srOnly">{LANDING_COPY.teacher.examplePrompt}</span>
                  <span ref={typedRef} aria-hidden="true" data-count="-1">{mode === "static" ? LANDING_COPY.teacher.examplePrompt : ""}</span>
                  <span className="lk-caret" aria-hidden="true" />
                </p>
                <ol className="lk-steps">
                  {LANDING_COPY.teacher.steps.map((step, index) => (
                    <li key={step.title} ref={(el) => { stepRefs.current[index] = el; }}>
                      <span className="lk-stepIndex">{index + 1}</span>
                      <span><strong>{step.title}</strong><small>{step.detail}</small></span>
                    </li>
                  ))}
                </ol>
                <Link className={`lk-cta lk-ctaBlock`} href="/teacher/games/create">{LANDING_COPY.teacher.cta}<ArrowIcon /></Link>
              </div>
            </div>

            <div ref={summitRef} className={`lk-layer lk-summit`}>
              <p className="lk-eyebrow">{LANDING_COPY.summit.eyebrow}</p>
              <h2 className="lk-summitTitle">{LANDING_COPY.summit.title}</h2>
              <p className="lk-summitBody">{LANDING_COPY.summit.body}</p>
              <ul className="lk-skills" aria-label="Kỹ năng bé rèn luyện">
                {LANDING_COPY.summit.skills.map((skill) => <li key={skill}>{skill}</li>)}
              </ul>
            </div>

            <div ref={farewellRef} className={`lk-layer lk-farewell`}>
              <h2 className="lk-farewellTitle">{LANDING_COPY.farewell.title}</h2>
              <p className="lk-farewellSubtitle">{LANDING_COPY.farewell.subtitle}</p>
              <div className="lk-farewellActions">
                <a className={`lk-cta lk-ctaLarge`} href="#tro-choi" onClick={goTo("games")}>{LANDING_COPY.farewell.cta}<ArrowIcon /></a>
                <Link className="lk-ghostLink" href="/login">{LANDING_COPY.farewell.secondary}</Link>
              </div>
            </div>

            <div ref={sayRef} className="lk-say" role="status" aria-live="polite" data-show="false" />
            {found.length > 0 ? (
              <p className="lk-quest" role="status" data-done={found.length === QUEST.length}>
                <span>{found.length === QUEST.length ? LANDING_COPY.quest.done : `${LANDING_COPY.quest.label} ${found.length}/${QUEST.length}`}</span>
                <span className="lk-questDots" aria-hidden="true">{QUEST.map((id) => <i key={id} data-found={found.includes(id)} />)}</span>
              </p>
            ) : null}
            {canSound ? (
              <button type="button" className="lk-sound" aria-pressed={soundOn} aria-label={soundOn ? LANDING_COPY.sound.off : LANDING_COPY.sound.on} onClick={toggleSound}>
                <SoundIcon on={soundOn} />
                <span>{LANDING_COPY.sound.label}</span>
              </button>
            ) : null}
            <div className="lk-progress" aria-hidden="true"><span ref={progressRef} /></div>
          </div>
        </section>

        <section id="tro-choi" className="lk-games" aria-labelledby="games-title">
          <div className="lk-gamesInner">
            <div className="lk-gamesHead">
              <div>
                <p className="lk-eyebrow">{LANDING_COPY.games.eyebrow}</p>
                <h2 id="games-title" className="lk-gamesTitle">{LANDING_COPY.games.title}</h2>
              </div>
              <p className="lk-gamesSubtitle">{LANDING_COPY.games.subtitle}</p>
            </div>
            <div className="lk-cards">
              {LANDING_COPY.games.cards.map((card) => (
                <article key={card.id} className="lk-gameCard">
                  <div className="lk-thumb" data-kind={card.id} aria-hidden="true">
                    <div className="lk-thumbArt">
                      {card.id === "shadow" ? (
                        <>
                          <img src={LANDING_ASSETS.gameImages.shadowMatch.subject} alt="" />
                          <span className="lk-thumbLink" />
                          <img src={LANDING_ASSETS.gameImages.shadowMatch.shadow} alt="" />
                        </>
                      ) : card.id === "count" ? (
                        <>
                          <div className="lk-thumbApples">{[0, 1, 2, 3].map((i) => <img key={i} src={LANDING_ASSETS.gameImages.counting.item} alt="" />)}</div>
                          <span className="lk-thumbNumber">4</span>
                        </>
                      ) : (
                        <>
                          <div className="lk-thumbSort"><img src={LANDING_ASSETS.gameImages.classification.red} alt="" /><img src={LANDING_ASSETS.gameImages.classification.basketRed} alt="" /></div>
                          <div className="lk-thumbSort"><img src={LANDING_ASSETS.gameImages.classification.blue} alt="" /><img src={LANDING_ASSETS.gameImages.classification.basketBlue} alt="" /></div>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="lk-cardBody">
                    <span className="lk-tag">{card.tag}</span>
                    <h3>{card.title}</h3>
                    <p>{card.description}</p>
                    {/* Play a sample right here, or sign in and land on the child game list filtered to this kind of game. */}
                    <div className="lk-cardActions">
                      <button type="button" className="lk-cardPlay" onClick={() => setDemo(GAME_CARD_TYPES[card.id])}>{LANDING_COPY.games.cardCta}<ArrowIcon /></button>
                      <Link className="lk-cardLink" href={loginHref(`/child/games?type=${GAME_CARD_TYPES[card.id]}`)}>{LANDING_COPY.games.cardLogin}</Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <p className="lk-gamesNote">{LANDING_COPY.games.note}</p>
          </div>

          <div id="phu-huynh" className="lk-family" aria-labelledby="family-title">
            <div className="lk-familyIntro">
              <p className="lk-eyebrow">{LANDING_COPY.family.eyebrow}</p>
              <h2 id="family-title" className="lk-familyTitle">{LANDING_COPY.family.title}</h2>
              <p className="lk-familySubtitle">{LANDING_COPY.family.subtitle}</p>
              <div className="lk-familyActions">
                <Link className="lk-cta lk-ctaLarge" href="/register">{LANDING_COPY.family.cta}<ArrowIcon /></Link>
                <Link className="lk-ghostLink" href="/login?mode=child">{LANDING_COPY.family.child}</Link>
              </div>
            </div>
            <ol className="lk-familySteps">
              {LANDING_COPY.family.steps.map((step, index) => (
                <li key={step.title} className="lk-familyStep">
                  <span className="lk-familyNumber" aria-hidden="true">{index + 1}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="lk-familyNote">{LANDING_COPY.family.note}</p>
          </div>

          <footer className="lk-footer">
            <div className="lk-footerBrand">
              <span className="lk-brand"><LumiLogo size={28} /><LumiWordmark /></span>
              <p>{siteTagline ?? LANDING_COPY.footer.tagline}</p>
            </div>
            <nav aria-label="Liên kết cuối trang" className="lk-footerLinks">
              {LANDING_COPY.footer.links.map((link) => <Link key={link.href} href={link.href}>{link.label}</Link>)}
            </nav>
            <p className="lk-copyright">© {new Date().getFullYear()} {siteName}.</p>
            <details className="lk-credits">
              <summary>{LANDING_COPY.footer.creditsLabel}</summary>
              <p>{LANDING_COPY.footer.credits}</p>
            </details>
          </footer>
        </section>
      </main>
      {demo ? <LandingDemo key={demo} type={demo} loginHref={loginHref(`/child/games?type=${demo}`)} onClose={() => setDemo(null)} /> : null}
    </div>
  );
}
