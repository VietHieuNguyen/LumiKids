"use client";

import { useRef, useState } from "react";
import type { PointerEvent, MouseEvent, KeyboardEvent, RefObject } from "react";

interface Gesture {
  pointerId: number;
  sourceId: string;
  x: number;
  y: number;
  dragging: boolean;
}
export function usePointerPairing(
  scope: RefObject<HTMLDivElement | null>,
  onDrop: (sourceId: string, targetId: string) => void,
) {
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drag, setDrag] = useState<{
    sourceId: string;
    x: number;
    y: number;
  } | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  function targetAt(x: number, y: number): string | null {
    for (const element of document.elementsFromPoint(x, y)) {
      const target = element.closest<HTMLElement>("[data-game-target-id]");
      if (target && scope.current?.contains(target))
        return target.dataset.gameTargetId ?? null;
    }
    return null;
  }
  function clearGesture() {
    gesture.current = null;
    setDrag(null);
    setHoverId(null);
  }
  function pointerDown(
    event: PointerEvent<HTMLButtonElement>,
    sourceId: string,
  ) {
    if (!event.isPrimary || event.button !== 0 || gesture.current) return;
    suppressClick.current = false;
    gesture.current = {
      pointerId: event.pointerId,
      sourceId,
      x: event.clientX,
      y: event.clientY,
      dragging: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointerMove(event: PointerEvent<HTMLButtonElement>) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (
      !current.dragging &&
      Math.hypot(event.clientX - current.x, event.clientY - current.y) < 8
    )
      return;
    current.dragging = true;
    setSelectedId(current.sourceId);
    setDrag({ sourceId: current.sourceId, x: event.clientX, y: event.clientY });
    setHoverId(targetAt(event.clientX, event.clientY));
  }
  function pointerUp(event: PointerEvent<HTMLButtonElement>) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const target = current.dragging
      ? targetAt(event.clientX, event.clientY)
      : null;
    suppressClick.current = current.dragging;
    clearGesture();
    if (current.dragging) {
      setSelectedId(null);
      if (target) onDrop(current.sourceId, target);
    }
  }
  function pointerCancel(event: PointerEvent<HTMLButtonElement>) {
    if (gesture.current?.pointerId !== event.pointerId) return;
    suppressClick.current = true;
    clearGesture();
    setSelectedId(null);
  }
  function select(event: MouseEvent<HTMLButtonElement>, sourceId: string) {
    if (suppressClick.current && event.detail !== 0) {
      suppressClick.current = false;
      return;
    }
    suppressClick.current = false;
    setSelectedId((current) => (current === sourceId ? null : sourceId));
  }
  function drop(targetId: string) {
    if (selectedId) {
      onDrop(selectedId, targetId);
      setSelectedId(null);
    }
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      clearGesture();
      setSelectedId(null);
      suppressClick.current = true;
    }
  }
  return {
    selectedId,
    drag,
    hoverId,
    pointerDown,
    pointerMove,
    pointerUp,
    pointerCancel,
    select,
    drop,
    onKeyDown,
  };
}
