"use client";
import type { CSSProperties } from "react";
import { useRef } from "react";
import type { QuantityContent, QuantityState } from "@lumikids/shared";
import type { RendererCommonProps } from "./types";
import { usePointerPairing } from "./use-pointer-pairing";
import { PairingSource, DragGhost } from "./pairing-parts";
import { BasketArtwork } from "./basket-artwork";
import { GamePicture } from "./game-picture";

export function QuantityGame({
  content,
  state,
  onAction,
  ...props
}: RendererCommonProps & { content: QuantityContent; state: QuantityState }) {
  const scope = useRef<HTMLDivElement>(null);
  const pairing = usePointerPairing(scope, (sourceId, targetId) =>
    onAction({ actionType: "QUANTITY_DROP", sourceId, targetId }),
  );
  const remaining = content.items.filter(
    (i) => !state.placements.some((p) => p.itemId === i.id),
  );
  const last = state.lastInteraction;
  const wrong =
    last?.actionType === "QUANTITY_DROP" && last.result === "INCORRECT"
      ? last
      : null;
  const picture = (id: string, className = "quantity-fruit") => {
    const item = content.items.find((i) => i.id === id);
    return (
      <GamePicture
        assetId={item?.assetId}
        label={item?.label ?? "Quả"}
        assetUrls={props.assetUrls}
        assetRevisions={props.assetRevisions}
        onAssetError={props.onAssetError}
        className={className}
      />
    );
  };
  return (
    <div ref={scope} className="quantity-board" onKeyDown={pairing.onKeyDown}>
      <h3 className="quantity-heading">
        {content.mode === "SPLIT" ? "Cùng bé tách quả" : "Cùng bé gộp quả"}
      </h3>
      <p className="quantity-instruction">{content.instruction}</p>
      {remaining.length > 0 && (
        <section className="quantity-source" aria-label="Quả để kéo vào giỏ">
          {remaining.map((item) => (
            <div
              key={`${item.id}:${wrong?.sourceId === item.id ? wrong.eventId : "ready"}`}
              data-wrong={wrong?.sourceId === item.id || undefined}
            >
              <PairingSource
                id={item.id}
                label={item.label ?? "quả"}
                pairing={pairing}
                className="quantity-source-fruit"
              >
                {picture(item.id)}
              </PairingSource>
            </div>
          ))}
        </section>
      )}
      <div className="quantity-baskets">
        {content.baskets.map((basket) => {
          const placed = state.placements.filter(
            (p) => p.basketId === basket.id,
          );
          const basketArt = (
            <BasketArtwork
              assetId={content.basketAssetId}
              assetUrls={props.assetUrls}
              assetRevisions={props.assetRevisions}
              onAssetError={props.onAssetError}
            />
          );
          return (
            <button
              key={basket.id}
              type="button"
              className="quantity-basket"
              data-game-target-id={basket.id}
              data-hovered={pairing.hoverId === basket.id || undefined}
              aria-label={`${basket.label}: ${basket.requirements.map((r) => `${r.count} ${content.items.find((i) => i.assetId === r.assetId)?.label ?? "quả"}`).join(", ")}`}
              disabled={state.completed}
              onClick={() => pairing.drop(basket.id)}
            >
              <span className="quantity-basket-title">{basket.label}</span>
              <span className="quantity-order">
                {basket.requirements.map((r) => (
                  <span key={r.assetId}>
                    {picture(
                      content.items.find((i) => i.assetId === r.assetId)!.id,
                      "quantity-order-picture",
                    )}
                    <strong>× {r.count}</strong>
                  </span>
                ))}
              </span>
              <span className="quantity-basket-body">
                <span className="quantity-basket-back">{basketArt}</span>
                <span className="quantity-placed">
                  {placed.map((p, index) => (
                    <span
                      key={p.itemId}
                      className="quantity-nest-fruit"
                      style={
                        {
                          "--fruit-x": `${[38, 61, 50, 28, 72, 38, 61, 50, 28, 72][index]}%`,
                          "--fruit-bottom": `${[32, 32, 43, 38, 38, 53, 53, 62, 59, 59][index]}%`,
                          "--fruit-turn": `${[-14, 12, -4, -20, 19, -10, 14, 0, -16, 18][index]}deg`,
                          zIndex: 10 - index,
                        } as CSSProperties
                      }
                    >
                      {picture(p.itemId)}
                    </span>
                  ))}
                </span>
                <span className="quantity-basket-front" aria-hidden="true">
                  {basketArt}
                </span>
              </span>
              <span className="quantity-basket-count">
                {placed.length} /{" "}
                {basket.requirements.reduce((n, r) => n + r.count, 0)}
              </span>
            </button>
          );
        })}
      </div>
      <p role="status" className="quantity-status" key={last?.eventId}>
        {wrong
          ? "Giỏ đã đủ loại quả này rồi. Bé chọn quả khác nhé!"
          : "Kéo quả vào giỏ, hoặc chọn quả rồi chạm vào giỏ."}
      </p>
      <DragGhost pairing={pairing} label="Quả đang kéo">
        {pairing.drag && picture(pairing.drag.sourceId)}
      </DragGhost>
    </div>
  );
}
