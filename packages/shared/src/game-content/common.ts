import { z } from "zod";

/** Wire-format version, independent of ActivityVersion.versionNumber. */
export const GAME_CONTENT_SCHEMA_VERSION = 1 as const;
export const gameTypeSchema = z.enum([
  "COUNTING",
  "MATCHING",
  "CLASSIFICATION",
]);
export type GameType = z.infer<typeof gameTypeSchema>;

// Local IDs are case-sensitive and never trimmed/coerced during parsing.
export const gameElementIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/);
// GameAsset.id is a PostgreSQL UUID in the current repository.
export const gameAssetIdSchema = z.uuid();

export const completionRuleSchema = z.enum([
  "CORRECT_CHOICE",
  "ALL_PAIRS_CORRECT",
  "ALL_ITEMS_CLASSIFIED_CORRECTLY",
]);
export type CompletionRule = z.infer<typeof completionRuleSchema>;

export const baseContentShape = {
  schemaVersion: z.literal(GAME_CONTENT_SCHEMA_VERSION),
  instruction: z.string().trim().min(1).max(1000),
};

export const assetItemSchema = z.strictObject({
  id: gameElementIdSchema,
  assetId: gameAssetIdSchema,
  label: z.string().trim().min(1).max(120).optional(),
});
export type AssetItem = z.infer<typeof assetItemSchema>;

/** IDs are unique across all element collections within one task. Reusing an assetId is allowed. */
export function checkUniqueElementIds(
  sections: readonly { key: string; items: readonly { id: string }[] }[],
  context: z.RefinementCtx,
): void {
  const ids = new Set<string>();
  for (const { key, items } of sections) {
    items.forEach((item, index) => {
      if (ids.has(item.id)) {
        context.addIssue({
          code: "custom",
          path: [key, index, "id"],
          message: `Duplicate element ID: ${item.id}.`,
        });
      }
      ids.add(item.id);
    });
  }
}
