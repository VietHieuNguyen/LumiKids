"use client";

import { useMemo, useRef } from "react";

import type { MatchingContent } from "@lumikids/shared";
import type { MatchingState } from "../model/types";
import type { RendererCommonProps } from "./types";
import { GamePicture } from "./game-picture";
import { usePointerPairing } from "./use-pointer-pairing";
import { DragGhost, PairingHint, PairingSource } from "./pairing-parts";
import { PlayBoard, PlayStep } from "./play-board";
import { readableGameText } from "./display-text";
import { MatchingCardRail } from "./matching-card-rail";
import { arrangeMatchingTargets } from "../model/matching-layout";

export function MatchingGame({
  content,
  state,
  assetUrls,
  assetRevisions,
  onAction,
  onAssetError,
  presentationSeed = "matching",
}: RendererCommonProps & { content: MatchingContent; state: MatchingState }) {
  const scope = useRef<HTMLDivElement>(null);
  const targetItems = useMemo(
    () => arrangeMatchingTargets(content, presentationSeed),
    [content, presentationSeed],
  );
  const pairing = usePointerPairing(scope, (sourceId, targetId) =>
    onAction({ actionType: "MATCH_DROP", sourceId, targetId }),
  );
  const remaining = content.sourceItems.filter(
    (item) => !state.matches.some((pair) => pair.sourceId === item.id),
  );
  const selected = content.sourceItems.find(
    (item) => item.id === pairing.selectedId,
  );
  const sourceLabel = (item: MatchingContent["sourceItems"][number]) =>
    readableGameText(
      item.label ??
        `Hình ${content.sourceItems.findIndex((entry) => entry.id === item.id) + 1}`,
    );
  const targetLabel = (item: MatchingContent["targetItems"][number]) =>
    readableGameText(
      item.label ??
        `Hình đích ${content.targetItems.findIndex((entry) => entry.id === item.id) + 1}`,
    );
  return (
    <div ref={scope} onKeyDown={pairing.onKeyDown}>
      <PlayBoard variant="matching" title="Tìm bạn cho mỗi hình!">
        <p className="matching-round-count">
          {state.completed
            ? "★ Con đã tìm đủ các cặp rồi!"
            : `Đã ghép ${state.matches.length}/${content.sourceItems.length} cặp`}
        </p>
        <div className="matching-trays">
          <section
            aria-label="Hình cần ghép"
            className="play-panel matching-tray matching-source-tray"
          >
            <PlayStep number={1}>Chọn một hình</PlayStep>
            <p className="play-panel-caption">
              Chọn hình, rồi tìm bạn ở hàng bên dưới.
            </p>
            {remaining.length ? (
              <MatchingCardRail label="Hình cần ghép" count={remaining.length}>
                {remaining.map((item) => (
                  <PairingSource
                    key={item.id}
                    id={item.id}
                    label={sourceLabel(item)}
                    pairing={pairing}
                    className="matching-picture-card"
                  >
                    <span className="matching-card-window">
                      <GamePicture
                        assetId={item.assetId}
                        label={sourceLabel(item)}
                        assetUrls={assetUrls}
                        assetRevisions={assetRevisions}
                        onAssetError={onAssetError}
                        className="matching-picture"
                      />
                    </span>
                    <span className="matching-card-note" aria-hidden="true">
                      {pairing.selectedId === item.id ? "✓" : "↘"}
                    </span>
                  </PairingSource>
                ))}
              </MatchingCardRail>
            ) : (
              <div
                className="matching-source-complete"
                role="status"
                aria-label="Đã ghép đúng tất cả các hình"
              >
                <span aria-hidden="true">★</span>
              </div>
            )}
          </section>
          <section
            aria-label="Đích ghép"
            className="play-panel matching-tray matching-target-tray"
          >
            <PlayStep number={2}>Tìm hình phù hợp</PlayStep>
            <p className="play-panel-caption">
              Dùng nút mũi tên để tìm thêm hình nhé!
            </p>
            <MatchingCardRail label="Hình đích" count={targetItems.length}>
              {targetItems.map((item) => {
                const matchIndex = state.matches.findIndex(
                  (pair) => pair.targetId === item.id,
                );
                const done = matchIndex >= 0;
                const matchedSource = done
                  ? content.sourceItems.find(
                      (source) =>
                        source.id === state.matches[matchIndex]?.sourceId,
                    )
                  : undefined;
                const displayLabel = matchedSource
                  ? sourceLabel(matchedSource)
                  : targetLabel(item);
                const wrong =
                  state.lastInteraction?.result === "INCORRECT" &&
                  state.lastInteraction.actionType === "MATCH_DROP" &&
                  state.lastInteraction.targetId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={done || state.completed}
                    data-game-target-id={
                      done || state.completed ? undefined : item.id
                    }
                    aria-label={
                      done
                        ? `${displayLabel}, đã ghép đúng vào ${targetLabel(item)}`
                        : `Ghép vào ${targetLabel(item)}`
                    }
                    className={`matching-picture-card matching-target-card ${done ? "is-matched" : ""} ${pairing.hoverId === item.id ? "is-hovered" : ""} ${wrong ? "is-incorrect" : ""}`}
                    onClick={() => pairing.drop(item.id)}
                  >
                    <span className="matching-card-window">
                      <GamePicture
                        assetId={matchedSource?.assetId ?? item.assetId}
                        label={displayLabel}
                        assetUrls={assetUrls}
                        assetRevisions={assetRevisions}
                        onAssetError={onAssetError}
                        className="matching-picture"
                      />
                    </span>
                    <span className="matching-card-label">{displayLabel}</span>
                    <span className="matching-card-note" aria-hidden="true">
                      {done
                        ? `✓ ${matchIndex + 1}`
                        : pairing.hoverId === item.id
                          ? "↓"
                          : wrong
                            ? "↻"
                            : "↓"}
                    </span>
                  </button>
                );
              })}
            </MatchingCardRail>
          </section>
        </div>
        <div className="play-board-help">
          <PairingHint
            selectedLabel={selected ? sourceLabel(selected) : undefined}
          />
        </div>
      </PlayBoard>
      <DragGhost
        pairing={pairing}
        label={selected ? sourceLabel(selected) : "Hình đang kéo"}
      >
        {selected && (
          <GamePicture
            assetId={selected.assetId}
            label={selected.label ?? ""}
            assetUrls={assetUrls}
            assetRevisions={assetRevisions}
            onAssetError={onAssetError}
            className="game-drag-picture"
          />
        )}
      </DragGhost>
    </div>
  );
}
