"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { currentPatternSequence } from "@lumikids/shared";
import type { PatternContent, PatternState } from "@lumikids/shared";
import type { RendererCommonProps } from "./types";
import { GamePicture } from "./game-picture";
import { PlayBoard, PlayStep } from "./play-board";
import { usePointerPairing } from "./use-pointer-pairing";
import { patternCellSize } from "../model/pattern-layout";

const BLANK_ID = "pattern-blank";
/** How long a solved row stays on screen (bounce + filled blank) before the next row appears. */
const ADVANCE_DELAY_MS = 1200;

/**
 * One sequence per screen, everything visible at once: no rail, no arrows.
 * The child taps or drags a card into the blank; a correct answer moves on by itself.
 */
export function PatternGame({
  content,
  state,
  assetUrls,
  assetRevisions,
  onAction,
  onAssetError,
  hint,
}: RendererCommonProps & { content: PatternContent; state: PatternState }) {
  const current = currentPatternSequence(content, state);
  const last = state.lastInteraction;
  // Keep the just-solved row on screen briefly so the child sees the filled blank.
  const justSolvedId =
    last?.actionType === "FILL_PATTERN" && last.result === "CORRECT" ? last.sourceId : null;
  const [releasedId, setReleasedId] = useState<string | null>(null);
  const heldId = justSolvedId && releasedId !== justSolvedId ? justSolvedId : null;
  useEffect(() => {
    if (!heldId) return;
    const timer = window.setTimeout(() => setReleasedId(heldId), ADVANCE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [heldId]);
  const solvedRow = heldId ? (content.sequences.find((entry) => entry.id === heldId) ?? null) : null;
  const sequence = solvedRow ?? current;

  const scope = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 1024, height: 768 });
  useEffect(() => {
    const element = scope.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setViewport({ width: entry.contentRect.width, height: window.innerHeight }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const fill = (itemId: string) => {
    if (sequence && !solvedRow && !state.completed)
      onAction({ actionType: "FILL_PATTERN", sourceId: sequence.id, targetId: itemId });
  };
  const pairing = usePointerPairing(scope, (itemId) => fill(itemId));
  // A drag ends with a click event too; it must not fill the blank a second time.
  const justDragged = useRef(false);
  // A wrong card shakes once per wrong answer event.
  const [settledEventId, setSettledEventId] = useState<string | null>(null);
  const wrongEvent =
    last?.actionType === "FILL_PATTERN" && last.result === "INCORRECT" && settledEventId !== last.eventId
      ? last
      : null;
  const wrongId = wrongEvent?.targetId ?? null;
  useEffect(() => {
    if (!wrongEvent) return;
    const timer = window.setTimeout(() => setSettledEventId(wrongEvent.eventId), 600);
    return () => window.clearTimeout(timer);
  }, [wrongEvent]);

  if (!sequence) return null;
  const items = new Map(content.items.map((item) => [item.id, item]));
  const lit = new Set(hint?.taskId === sequence.id ? hint.targetIds : []);
  const size = patternCellSize(viewport, sequence.cells.length);
  const picture = (itemId: string, className: string) => {
    const item = items.get(itemId);
    return (
      <GamePicture
        assetId={item?.assetId}
        label={item?.label ?? "Hình"}
        assetUrls={assetUrls}
        assetRevisions={assetRevisions}
        onAssetError={onAssetError}
        className={className}
      />
    );
  };
  const position = content.sequences.findIndex((entry) => entry.id === sequence.id);
  return (
    <PlayBoard variant="matching" title="Hình nào tiếp theo?">
      <div
        ref={scope}
        className="pattern-board"
        style={{ "--pattern-cell": `${size}px` } as CSSProperties}
        onKeyDown={pairing.onKeyDown}
      >
        <ol className="pattern-progress" aria-label={`Dãy ${position + 1} trên ${content.sequences.length}`}>
          {content.sequences.map((entry, index) => (
            <li
              key={entry.id}
              data-state={
                state.solvedSequenceIds.includes(entry.id) ? "done" : index === position ? "current" : "todo"
              }
            />
          ))}
        </ol>
        <section className="play-panel pattern-row-panel" aria-label="Dãy hình">
          <PlayStep number={1}>Con nhìn dãy hình nhé!</PlayStep>
          <div className={`pattern-row ${solvedRow ? "is-solved" : ""}`} key={sequence.id}>
            {sequence.cells.map((itemId, index) => (
              <div
                key={index}
                className={`pattern-cell ${lit.has(`${sequence.id}:cell:${index}`) ? "is-hinted" : ""}`}
                style={{ "--cell-index": index } as CSSProperties}
              >
                {picture(itemId, "pattern-picture")}
              </div>
            ))}
            <button
              type="button"
              className={`pattern-cell pattern-blank ${pairing.hoverId === BLANK_ID ? "is-hovered" : ""}`}
              data-game-target-id={BLANK_ID}
              aria-label="Ô trống: đặt hình tiếp theo vào đây"
              disabled={Boolean(solvedRow)}
              tabIndex={-1}
              style={{ "--cell-index": sequence.cells.length } as CSSProperties}
            >
              {solvedRow ? picture(sequence.correctItemId, "pattern-picture") : <span aria-hidden="true">?</span>}
            </button>
          </div>
        </section>
        <section className="play-panel pattern-choice-panel" aria-label="Chọn hình">
          <PlayStep number={2}>Chạm hoặc kéo hình đúng vào ô trống</PlayStep>
          <div className="pattern-choices">
            {sequence.choiceIds.map((itemId) => (
              <button
                key={itemId}
                type="button"
                className="pattern-choice"
                data-selected={pairing.selectedId === itemId || undefined}
                data-wrong={wrongId === itemId || undefined}
                disabled={Boolean(solvedRow) || state.completed}
                aria-label={`Chọn ${items.get(itemId)?.label ?? "hình"}`}
                onPointerDown={(event) => pairing.pointerDown(event, itemId)}
                onPointerMove={pairing.pointerMove}
                onPointerUp={(event) => {
                  justDragged.current = pairing.drag !== null;
                  pairing.pointerUp(event);
                }}
                onPointerCancel={pairing.pointerCancel}
                onClick={() => {
                  // A tap fills the blank directly: one step for small hands.
                  if (justDragged.current) justDragged.current = false;
                  else fill(itemId);
                }}
              >
                {picture(itemId, "pattern-picture")}
              </button>
            ))}
          </div>
        </section>
        {pairing.drag && (
          <div
            className="pattern-drag-ghost"
            style={{ left: pairing.drag.x, top: pairing.drag.y }}
            aria-hidden="true"
          >
            {picture(pairing.drag.sourceId, "pattern-picture")}
          </div>
        )}
      </div>
    </PlayBoard>
  );
}
