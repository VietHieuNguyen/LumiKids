"use client";

import { useRef } from "react";
import type { ClassificationContent } from "@lumikids/shared";
import type { ClassificationState } from "../model/types";
import type { RendererCommonProps } from "./types";
import { MatchingCardRail } from "./matching-card-rail";
import { GamePicture } from "./game-picture";
import { usePointerPairing } from "./use-pointer-pairing";
import { DragGhost, PairingHint, PairingSource } from "./pairing-parts";

export function ClassificationGame({
  content,
  state,
  assetUrls,
  assetRevisions,
  onAction,
  onAssetError,
}: RendererCommonProps & {
  content: ClassificationContent;
  state: ClassificationState;
}) {
  const scope = useRef<HTMLDivElement>(null);
  const pairing = usePointerPairing(scope, (sourceId, targetId) =>
    onAction({ actionType: "CLASSIFY_DROP", sourceId, targetId }),
  );
  const selected = content.items.find((item) => item.id === pairing.selectedId);
  const labelFor = (item: ClassificationContent["items"][number]) =>
    item.label ??
    `Hình ${content.items.findIndex((entry) => entry.id === item.id) + 1}`;
  const remaining = content.items.filter(
    (item) =>
      !state.placements.some((placement) => placement.itemId === item.id),
  );
  return (
    <div ref={scope} onKeyDown={pairing.onKeyDown}>
      <div className="classification-stage">
        <div className="classification-banner">
          <span aria-hidden="true" className="classification-banner-star">
            ✦
          </span>
          <div>
            <p className="classification-eyebrow">Cùng bé khám phá</p>
            <h3>Cùng tìm đúng nhóm!</h3>
          </div>
          <span aria-hidden="true" className="classification-banner-star">
            ✦
          </span>
        </div>
        <div className="scene-play-area">
          <section
            aria-label="Các hình chờ phân loại"
            className="classification-source-panel"
          >
            <div className="classification-section-heading">
              <h4>
                <span className="classification-step" aria-hidden="true">
                  1
                </span>{" "}
                Chọn một hình
              </h4>
              <span className="classification-count">
                Còn {remaining.length} hình
              </span>
            </div>
            {remaining.length ? (
              <MatchingCardRail
                label="Hình chờ phân loại"
                count={remaining.length}
                trackClassName="classification-animal-grid"
              >
                {remaining.map((item) => (
                  <PairingSource
                    key={item.id}
                    id={item.id}
                    label={labelFor(item)}
                    pairing={pairing}
                    className="classification-animal-card"
                  >
                    <span className="classification-animal-picture">
                      <GamePicture
                        assetId={item.assetId}
                        label={labelFor(item)}
                        assetUrls={assetUrls}
                        assetRevisions={assetRevisions}
                        onAssetError={onAssetError}
                        className="classification-source-picture"
                      />
                    </span>
                    {pairing.selectedId === item.id && (
                      <span
                        aria-hidden="true"
                        className="classification-selected-check"
                      >
                        ✓
                      </span>
                    )}
                  </PairingSource>
                ))}
              </MatchingCardRail>
            ) : (
              <div className="classification-all-placed">
                <span aria-hidden="true">★</span>
                <p>Giỏi lắm! Các hình đã ở đúng nhóm.</p>
              </div>
            )}
          </section>
          <div aria-hidden="true" className="classification-direction">
            <span>↓</span>
          </div>
          <section
            aria-label="Các nhóm phân loại"
            className="classification-target-panel"
          >
            <div className="classification-section-heading">
              <h4>
                <span className="classification-step" aria-hidden="true">
                  2
                </span>{" "}
                Đưa vào nhóm phù hợp
              </h4>
            </div>
            <MatchingCardRail
              label="Các nhóm phân loại"
              count={content.groups.length}
              trackClassName="classification-environment-grid"
            >
              {content.groups.map((group, index) => {
                const placed = content.items.filter((item) =>
                  state.placements.some(
                    (placement) =>
                      placement.itemId === item.id &&
                      placement.groupId === group.id,
                  ),
                );
                const wrong =
                  state.lastInteraction?.actionType === "CLASSIFY_DROP" &&
                  state.lastInteraction.result === "INCORRECT" &&
                  state.lastInteraction.targetId === group.id;
                const hovering = pairing.hoverId === group.id;
                return (
                  <div
                    key={group.id}
                    data-game-target-id={state.completed ? undefined : group.id}
                    className={`classification-environment-card ${hovering ? "is-hovered" : ""} ${wrong ? "is-incorrect" : ""}`}
                  >
                    <button
                      type="button"
                      disabled={state.completed}
                      className="classification-environment-button"
                      aria-label={`Đặt hình vào ${group.label}`}
                      onClick={() => pairing.drop(group.id)}
                    >
                      <span
                        className={`classification-environment-scene ${!group.assetId ? "is-label-only" : ""}`}
                      >
                        {group.assetId ? (
                          <GamePicture
                            assetId={group.assetId}
                            label={group.label}
                            assetUrls={assetUrls}
                            assetRevisions={assetRevisions}
                            onAssetError={onAssetError}
                            className="classification-environment-picture"
                            fit="cover"
                          />
                        ) : (
                          <span
                            aria-hidden="true"
                            className="classification-group-symbol"
                          >
                            {index + 1}
                          </span>
                        )}
                        <span className="classification-scene-count">
                          <span aria-hidden="true">✓ </span>
                          {placed.length}
                          <span className="sr-only"> hình đã đúng</span>
                        </span>
                      </span>
                      <span className="classification-environment-label">
                        {group.label}
                      </span>
                      <span className="classification-drop-hint">
                        {state.completed
                          ? "✓ Đã hoàn thành"
                          : hovering
                            ? "Thả hình vào đây nhé!"
                            : "Kéo hình hoặc chạm để chọn nhóm"}
                      </span>
                    </button>
                    <div
                      className="classification-placements"
                      tabIndex={placed.length ? 0 : undefined}
                      role="group"
                      aria-label={`Hình đã đúng trong ${group.label}`}
                    >
                      {placed.length ? (
                        placed.map((item) => (
                          <span
                            key={item.id}
                            className="classification-placed-item"
                            title={labelFor(item)}
                          >
                            <GamePicture
                              assetId={item.assetId}
                              label={labelFor(item)}
                              assetUrls={assetUrls}
                              assetRevisions={assetRevisions}
                              onAssetError={onAssetError}
                              className="classification-placed-picture"
                            />
                            <span
                              className="classification-placed-check"
                              aria-hidden="true"
                            >
                              ✓
                            </span>
                          </span>
                        ))
                      ) : (
                        <span className="classification-empty-placement">
                          Hình đúng sẽ nằm ở đây
                        </span>
                      )}
                    </div>
                    {wrong && (
                      <p className="classification-group-feedback">
                        ↻ Con thử nhóm khác nhé!
                      </p>
                    )}
                  </div>
                );
              })}
            </MatchingCardRail>
          </section>
          <div className="classification-help">
            <PairingHint
              selectedLabel={selected ? labelFor(selected) : undefined}
            />
            {content.schemaVersion === 2 && (
              <p>
                Một hình có thể phù hợp với nhiều nhóm. Con chỉ cần chọn một
                nhóm đúng cho mỗi hình.
              </p>
            )}
          </div>
        </div>
      </div>
      <DragGhost
        pairing={pairing}
        label={selected ? labelFor(selected) : "Hình đang kéo"}
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
