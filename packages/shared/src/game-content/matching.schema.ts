import { z } from "zod";
import {
  assetItemSchema,
  baseContentShape,
  checkUniqueElementIds,
  gameElementIdSchema,
} from "./common.js";

export const matchingPairSchema = z.strictObject({
  sourceId: gameElementIdSchema,
  targetId: gameElementIdSchema,
});
export type MatchingPair = z.infer<typeof matchingPairSchema>;

export const matchingContentStructureSchema = z.strictObject({
  ...baseContentShape,
  gameType: z.literal("MATCHING"),
  sourceItems: z.array(assetItemSchema).min(1).max(20),
  targetItems: z.array(assetItemSchema).min(1).max(20),
  pairs: z.array(matchingPairSchema).min(1).max(20),
  completionRule: z.literal("ALL_PAIRS_CORRECT"),
});

export const matchingContentSchema = matchingContentStructureSchema.superRefine(
  (content, context) => {
    checkUniqueElementIds(
      [
        { key: "sourceItems", items: content.sourceItems },
        { key: "targetItems", items: content.targetItems },
      ],
      context,
    );
    const sourceIds = new Set(content.sourceItems.map((item) => item.id));
    const targetIds = new Set(content.targetItems.map((item) => item.id));
    const pairedSources = new Set<string>();
    const pairedTargets = new Set<string>();
    content.pairs.forEach((pair, index) => {
      if (!sourceIds.has(pair.sourceId)) {
        context.addIssue({
          code: "custom",
          path: ["pairs", index, "sourceId"],
          message: "Matching source does not exist.",
        });
      }
      if (!targetIds.has(pair.targetId)) {
        context.addIssue({
          code: "custom",
          path: ["pairs", index, "targetId"],
          message: "Matching target does not exist.",
        });
      }
      if (pairedSources.has(pair.sourceId)) {
        context.addIssue({
          code: "custom",
          path: ["pairs", index, "sourceId"],
          message: "Each source must have exactly one correct target.",
        });
      }
      if (pairedTargets.has(pair.targetId)) {
        context.addIssue({
          code: "custom",
          path: ["pairs", index, "targetId"],
          message: "Each target must belong to exactly one correct pair.",
        });
      }
      pairedSources.add(pair.sourceId);
      pairedTargets.add(pair.targetId);
    });
    content.sourceItems.forEach((item) => {
      if (!pairedSources.has(item.id))
        context.addIssue({
          code: "custom",
          path: ["pairs"],
          message: `Source ${item.id} is missing a correct pair.`,
        });
    });
    content.targetItems.forEach((item) => {
      if (!pairedTargets.has(item.id))
        context.addIssue({
          code: "custom",
          path: ["pairs"],
          message: `Target ${item.id} is missing a correct pair.`,
        });
    });
  },
);

export type MatchingContent = z.infer<typeof matchingContentSchema>;
