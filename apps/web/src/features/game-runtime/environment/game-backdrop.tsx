"use client";

import { useEffect, useRef, useState } from "react";
import type { SceneTheme } from "../model/backgrounds";

/** Shared decoration for teacher previews and children's gameplay. The PNG remains if WebGL fails. */
export function GameBackdrop({ theme = "forest", className = "", onStatus }: { theme?: SceneTheme; className?: string; onStatus?: (status: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const callback = useRef(onStatus);
  const [status, setStatus] = useState("loading");
  useEffect(() => { callback.current = onStatus; }, [onStatus]);
  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    const update = (value: string) => {
      if (disposed) return;
      setStatus(value);
      callback.current?.(value);
    };
    // Each world is its own lazy chunk: the savanna (classification) has a separate perspective stage.
    const mount = theme === "savanna"
      ? import("./savanna/savanna-stage").then(({ mountSavannaStage }) => (target: HTMLCanvasElement) => mountSavannaStage(target, update))
      : import("./scenery-stage").then(({ mountSceneryStage }) => (target: HTMLCanvasElement) => mountSceneryStage(target, update, theme));
    void mount.then((start) => {
      if (!disposed && canvas.current) cleanup = start(canvas.current);
    }).catch(() => update("fallback"));
    return () => { disposed = true; cleanup?.(); };
  }, [theme]);
  return <canvas ref={canvas} className={className} data-scene-theme={theme} data-forest-status={status} aria-hidden="true" style={{ pointerEvents: "none" }} />;
}
