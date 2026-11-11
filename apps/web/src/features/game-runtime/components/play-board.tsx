import type { ReactNode } from "react";

export function PlayBoard({
  variant,
  title,
  children,
}: {
  variant: "counting" | "matching";
  title: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`play-board play-board-${variant}`}
      data-game-design="storybook-v3"
    >
      <div className="play-board-banner play-board-title">
        <div>
          <p>Cùng bé khám phá</p>
          <h3>{title}</h3>
        </div>
      </div>
      <div className="scene-play-area">{children}</div>
    </div>
  );
}

export function PlayStep({
  number,
  children,
}: {
  number: number;
  children: ReactNode;
}) {
  return (
    <h4 className="play-step">
      <span aria-hidden="true">{number}</span>
      {children}
    </h4>
  );
}
