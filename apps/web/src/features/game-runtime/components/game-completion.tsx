"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import Link from "next/link";

/** Shown after the runtime confirms every task is correct. */
export function GameCompletion({ continueHref }: { continueHref: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="game-completion"
      aria-label="Tuyệt vời! Con đã hoàn thành trò chơi"
      onCancel={(event) => event.preventDefault()}
    >
      <div className="game-completion-panel">
        <div className="game-completion-fireworks" aria-hidden="true">
          {Array.from({ length: 40 }, (_, index) => (
            <i
              key={index}
              style={
                {
                  "--launch-side": index % 2 ? "88%" : "12%",
                  "--dx": `${Math.round(Math.cos(index * 2.4) * (80 + (index % 5) * 22))}px`,
                  "--dy": `${-130 - (index % 7) * 32}px`,
                  "--spark-delay": `${(index % 10) * 130}ms`,
                  "--spark-color": ["#ffcc49", "#f3a6c7", "#93d6b1", "#c2a3ef"][
                    index % 4
                  ],
                } as CSSProperties
              }
            />
          ))}
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="game-completion-art"
          src="/assets/mascot/game-completion.png"
          alt="Gấu trắng vui mừng bên ba ngôi sao vàng. Tuyệt vời!"
          draggable={false}
        />
        <Link
          href={continueHref}
          className="game-completion-continue"
        >
          <svg
            viewBox="0 0 24 24"
            width="28"
            height="28"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M7 4.5a1 1 0 0 1 1.5-.86l12 7.5a1 1 0 0 1 0 1.72l-12 7.5A1 1 0 0 1 7 19.5Z" />
          </svg>
          Tiếp tục
        </Link>
      </div>
    </dialog>
  );
}
