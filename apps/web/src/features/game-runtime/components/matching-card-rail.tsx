"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";

export function MatchingCardRail({
  label,
  count,
  children,
  trackClassName = "",
}: {
  label: string;
  count: number;
  children: ReactNode;
  trackClassName?: string;
}) {
  const id = useId();
  const track = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState({ start: 0, end: count });

  function updateRange() {
    const element = track.current;
    if (!element) return;
    const bounds = element.getBoundingClientRect();
    const visible = Array.from(element.children).flatMap((child, index) => {
      const card = child.getBoundingClientRect();
      return card.left >= bounds.left - 2 && card.right <= bounds.right + 2
        ? [index]
        : [];
    });
    if (visible.length) {
      const start = visible[0];
      const end = visible[visible.length - 1] + 1;
      setRange((current) =>
        current.start === start && current.end === end
          ? current
          : { start, end },
      );
    }
  }

  useEffect(() => {
    const element = track.current;
    if (!element) return;
    const observer = new ResizeObserver(updateRange);
    observer.observe(element);
    for (const child of element.children) observer.observe(child);
    const frame = requestAnimationFrame(updateRange);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [count]);

  function move(direction: -1 | 1) {
    const element = track.current;
    if (!element) return;
    const index =
      direction === 1
        ? range.end
        : Math.max(0, range.start - (range.end - range.start));
    const card = element.children[Math.min(index, count - 1)];
    if (!card) return;
    const left =
      card.getBoundingClientRect().left -
      element.getBoundingClientRect().left -
      parseFloat(getComputedStyle(element).paddingLeft);
    element.scrollBy({
      left,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }

  return (
    <div className="matching-rail">
      <svg
        className="hanging-rail-rope"
        width="1000"
        height="64"
        viewBox="0 0 1000 64"
        preserveAspectRatio="none"
        fill="none"
        aria-hidden="true"
      >
        <path d="M0 12 Q500 64 1000 12" stroke="#fff8e4" strokeWidth="7" />
        <path d="M0 12 Q500 64 1000 12" stroke="#be86b4" strokeWidth="3" />
      </svg>
      <div
        className="matching-rail-controls"
        role="group"
        aria-label={`Chuyển hình: ${label}`}
      >
        <button
          type="button"
          className="matching-rail-arrow"
          aria-label={`${label}: xem các hình trước`}
          aria-controls={id}
          disabled={range.start === 0}
          onClick={() => move(-1)}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m15 5-7 7 7 7" />
          </svg>
        </button>
        <span
          className="matching-rail-range"
          aria-live="polite"
          aria-atomic="true"
        >
          <span className="sr-only">Hình </span>
          {range.start + 1}–{range.end} / {count}
        </span>
        <button
          type="button"
          className="matching-rail-arrow"
          aria-label={`${label}: xem thêm hình`}
          aria-controls={id}
          disabled={range.end >= count}
          onClick={() => move(1)}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m9 5 7 7-7 7" />
          </svg>
        </button>
      </div>
      <div
        id={id}
        ref={track}
        role="group"
        aria-label={label}
        tabIndex={0}
        className={`matching-card-list ${trackClassName}`}
        onScroll={updateRange}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            move(event.key === "ArrowLeft" ? -1 : 1);
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
