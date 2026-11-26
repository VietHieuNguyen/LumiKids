import { GamePicture } from "./game-picture";
import type { RendererCommonProps } from "./types";

/** Shared basket learning asset, used by partition and comparison/change boards. */
export function BasketArtwork({
  assetId,
  className = "quantity-basket-art",
  ...props
}: Pick<
  RendererCommonProps,
  "assetUrls" | "assetRevisions" | "onAssetError"
> & { assetId?: string; className?: string }) {
  if (assetId)
    return (
      <GamePicture
        assetId={assetId}
        label="Giỏ"
        assetUrls={props.assetUrls}
        assetRevisions={props.assetRevisions}
        onAssetError={props.onAssetError}
        className={className}
      />
    );
  return (
    <svg className={className} viewBox="0 0 300 160" aria-hidden="true">
      <path
        d="M70 55Q150-40 230 55"
        fill="none"
        stroke="#946239"
        strokeWidth="14"
      />
      <path
        d="M18 55H282L257 149H43Z"
        fill="#dfae66"
        stroke="#946239"
        strokeWidth="8"
      />
      <path
        d="M32 85H269M39 118H261M82 57L94 148M150 57V149M218 57L206 148"
        stroke="#bc884b"
        strokeWidth="5"
      />
    </svg>
  );
}
