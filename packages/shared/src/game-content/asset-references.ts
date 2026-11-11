import type { GameContent } from "./game-content.schema.js";

/** Projection supplied by the Backend's GameAsset service, not a duplicate Prisma model. */
export interface GameAssetAvailability {
  id: string;
  status: "ACTIVE" | "INACTIVE";
}
export interface GameContentAssetIssue {
  assetId: string;
  code: "ASSET_NOT_FOUND" | "ASSET_INACTIVE";
}

export function getGameContentAssetIds(content: GameContent): string[] {
  switch (content.gameType) {
    case "COUNTING":
      return [...new Set(content.items.map((item) => item.assetId))];
    case "MATCHING":
      return [
        ...new Set(
          [...content.sourceItems, ...content.targetItems].map(
            (item) => item.assetId,
          ),
        ),
      ];
    case "CLASSIFICATION":
      return [
        ...new Set([
          ...content.items.map((item) => item.assetId),
          ...content.groups.flatMap((group) =>
            group.assetId ? [group.assetId] : [],
          ),
        ]),
      ];
  }
}

/** Authoring validation only. Backend fetches the records; this pure helper never queries storage. */
export function getGameContentAssetIssues(
  content: GameContent,
  assets: readonly GameAssetAvailability[],
): GameContentAssetIssue[] {
  const available = new Map(assets.map((asset) => [asset.id, asset.status]));
  return getGameContentAssetIds(content).flatMap(
    (assetId): GameContentAssetIssue[] => {
      const status = available.get(assetId);
      if (!status) return [{ assetId, code: "ASSET_NOT_FOUND" }];
      if (status !== "ACTIVE") return [{ assetId, code: "ASSET_INACTIVE" }];
      return [];
    },
  );
}
