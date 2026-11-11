"use client";

import type { ReactNode } from "react";
import type { usePointerPairing } from "./use-pointer-pairing";

export type PairingControls = ReturnType<typeof usePointerPairing>;
export function PairingSource({
  id,
  label,
  pairing,
  children,
  className = "",
}: {
  id: string;
  label: string;
  pairing: PairingControls;
  children: ReactNode;
  className?: string;
}) {
  const selected = pairing.selectedId === id;
  return (
    <button
      type="button"
      aria-label={`Chọn ${label}`}
      aria-pressed={selected}
      className={`game-source ${className} ${selected ? "game-source-selected" : ""} ${pairing.drag?.sourceId === id ? "opacity-40" : ""}`}
      onPointerDown={(event) => pairing.pointerDown(event, id)}
      onPointerMove={pairing.pointerMove}
      onPointerUp={pairing.pointerUp}
      onPointerCancel={pairing.pointerCancel}
      onLostPointerCapture={pairing.pointerCancel}
      onClick={(event) => pairing.select(event, id)}
      onDragStart={(event) => event.preventDefault()}
    >
      {children}
      <span className="pairing-source-label max-w-full break-words text-sm font-semibold">
        {label}
      </span>
    </button>
  );
}
export function DragGhost({
  pairing,
  label,
  children,
}: {
  pairing: PairingControls;
  label: string;
  children?: ReactNode;
}) {
  return pairing.drag ? (
    <div
      aria-hidden="true"
      className="game-drag-ghost pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2"
      style={{ left: pairing.drag.x, top: pairing.drag.y }}
    >
      {children ?? <span aria-hidden="true">↘</span>}
      <span className="sr-only">{label}</span>
    </div>
  ) : null;
}
export function PairingHint({ selectedLabel }: { selectedLabel?: string }) {
  return (
    <p role="status" className="mb-5 min-h-6 text-sm leading-6 text-slate-600">
      {selectedLabel
        ? `Đã chọn ${selectedLabel}. Chọn đích hoặc nhấn Escape để bỏ chọn.`
        : "Kéo hình vào đích, hoặc chọn hình rồi chọn đích. Có thể dùng Tab và Enter/phím cách."}
    </p>
  );
}
