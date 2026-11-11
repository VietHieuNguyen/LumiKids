import type { GameContent } from "@lumikids/shared";
import type { GameAction, GameState } from "../model/types";

export type ResolvedAssetUrls = Readonly<Record<string, string | undefined>>;
export type AssetRevisions = Readonly<Record<string, number | undefined>>;
export type AssetErrorHandler = (
  assetId: string,
  failedUrl?: string,
  revision?: number,
) => void;
export interface RendererCommonProps {
  presentationSeed?: string;
  assetUrls: ResolvedAssetUrls;
  assetRevisions?: AssetRevisions;
  onAction: (action: GameAction) => void;
  onAssetError?: AssetErrorHandler;
}
export interface GameRendererProps extends RendererCommonProps {
  content: GameContent;
  state: GameState;
}
