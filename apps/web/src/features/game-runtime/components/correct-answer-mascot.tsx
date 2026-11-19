"use client";

import { useEffect, type CSSProperties } from "react";

const DURATION = 1900;

/** One transient, non-interactive celebration per confirmed answer burst. */
export function CorrectAnswerMascot({ result = "CORRECT", onDone }: {
  result?: "CORRECT" | "INCORRECT";
  onDone: () => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, DURATION);
    return () => window.clearTimeout(timer);
  }, [onDone]);

  return <div className="correct-mascot" data-side={result === "CORRECT" ? "right" : "left"} data-result={result} aria-hidden="true">
    <div className="correct-mascot-slide">
      {result === "CORRECT" && <div className="correct-mascot-confetti">
        {Array.from({ length: 24 }, (_, index) => <i key={index} style={{
          "--x": `${Math.round(Math.cos(index * 2.4) * (85 + index % 4 * 22))}px`,
          "--y": `${Math.round(Math.sin(index * 2.4) * (85 + index % 4 * 22))}px`,
          "--drift": "-15px",
          "--delay": `${300 + (index % 4) * 55}ms`,
          "--turn": `${index % 2 ? 100 : -90}deg`,
        } as CSSProperties} />)}
      </div>}
      {/* Static public artwork; no image proxy or additional dependencies needed. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/assets/mascot/bear-${result === "CORRECT" ? "correct" : "incorrect"}.png`} alt="" draggable={false} className="correct-mascot-bear" onError={onDone} />
    </div>
  </div>;
}
