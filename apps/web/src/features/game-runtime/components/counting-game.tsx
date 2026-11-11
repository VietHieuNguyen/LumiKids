"use client";

import type { CountingContent } from "@lumikids/shared";
import type { CountingState } from "../model/types";
import type { RendererCommonProps } from "./types";
import { GamePicture } from "./game-picture";
import { PlayBoard, PlayStep } from "./play-board";
import { MatchingCardRail } from "./matching-card-rail";

export function CountingGame({
  content,
  state,
  assetUrls,
  assetRevisions,
  onAction,
  onAssetError,
}: RendererCommonProps & { content: CountingContent; state: CountingState }) {
  const rule = content.schemaVersion === 2 ? content.countingRule : undefined;
  const target =
    content.schemaVersion === 2 && rule?.type === "OBJECT_TYPE"
      ? content.items.find((item) => content.countedItemIds.includes(item.id))
      : undefined;
  const color = rule && rule.type !== "ALL" ? rule.color : undefined;
  const swatches = {
    RED: "#e53935",
    BLUE: "#1976d2",
    GREEN: "#43a047",
    YELLOW: "#ffdf36",
    PURPLE: "#8e44ad",
    ORANGE: "#fb8c00",
    WHITE: "#fff",
    BLACK: "#222",
  };
  return (
    <PlayBoard variant="counting" title="Cùng đếm thật vui!">
      <section
        className="play-panel counting-observation"
        aria-label="Quan sát và đếm hình"
      >
        <PlayStep number={1}>Con quan sát và đếm nhé!</PlayStep>
        {(target || color) && (
          <div
            className="counting-visual-target"
            role="group"
            aria-label="Hình hoặc màu cần đếm"
          >
            {target && (
              <GamePicture
                assetId={target.assetId}
                label={target.label ?? "Hình cần đếm"}
                assetUrls={assetUrls}
                assetRevisions={assetRevisions}
                onAssetError={onAssetError}
                className="counting-target-picture"
              />
            )}
            {color && (
              <span
                className="counting-target-color"
                role="img"
                aria-label={`Màu ${color}`}
                style={{ backgroundColor: swatches[color] }}
              />
            )}
            <span aria-hidden="true">→ ?</span>
          </div>
        )}
        <MatchingCardRail
          label="Các hình để quan sát và đếm"
          count={content.items.length}
          trackClassName="counting-picture-rail"
        >
          {content.items.map((item) => (
            <div key={item.id} className="counting-picture-card">
              <GamePicture
                assetId={item.assetId}
                label={item.label ?? "Hình minh họa"}
                assetUrls={assetUrls}
                assetRevisions={assetRevisions}
                onAssetError={onAssetError}
                className="counting-picture"
              />
            </div>
          ))}
        </MatchingCardRail>
      </section>
      <div className="play-board-direction" aria-hidden="true">
        ↓
      </div>
      <section
        className="play-panel counting-answer-panel"
        aria-label="Chọn đáp án"
      >
        <PlayStep number={2}>Con chọn số đúng nào!</PlayStep>
        <p className="play-panel-caption">Chạm vào một ô số bên dưới nhé.</p>
        <div className="counting-answer-grid">
          {content.choices.map((choice) => {
            const selected = choice.id === state.selectedChoiceId;
            const correct =
              selected && state.lastInteraction?.result === "CORRECT";
            return (
              <button
                key={choice.id}
                type="button"
                disabled={state.completed}
                aria-pressed={selected}
                aria-label={`Chọn đáp án ${choice.value}`}
                className="game-choice counting-number-choice"
                data-result={
                  selected ? (correct ? "correct" : "incorrect") : undefined
                }
                onClick={() =>
                  onAction({ actionType: "SELECT_CHOICE", sourceId: choice.id })
                }
              >
                {choice.value}
                {selected && (
                  <span aria-hidden="true" className="counting-answer-mark">
                    {correct ? "✓" : "↻"}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>
    </PlayBoard>
  );
}
