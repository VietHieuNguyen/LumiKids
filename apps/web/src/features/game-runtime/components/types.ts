import type { GameContent } from "@lumikids/shared";
import type { GameAction, GameState, HintTarget } from "@lumikids/shared";

export type ResolvedAssetUrls = Readonly<Record<string, string | undefined>>;
export type AssetRevisions = Readonly<Record<string, number | undefined>>;
export type AssetErrorHandler = (
  assetId: string,
  failedUrl?: string,
  revision?: number,
) => void;
export interface RendererCommonProps {
  onDisplayedQuestion?: (questionId:string)=>void;
  onDisplayedSequence?: (sequenceId: string) => void;
  presentationSeed?: string;
  assetUrls: ResolvedAssetUrls;
  assetRevisions?: AssetRevisions;
  onAction: (action: GameAction) => void;
  /** The hint the child just asked for; renderers light up what it points at. */
  hint?: HintTarget | null;
  onAssetError?: AssetErrorHandler;
}
export interface GameRendererProps extends RendererCommonProps {
  content: GameContent;
  state: GameState;
}
