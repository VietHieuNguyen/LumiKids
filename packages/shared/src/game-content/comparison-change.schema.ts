import { z } from "zod";
import {
  assetItemSchema,
  baseContentShape,
  gameAssetIdSchema,
  gameElementIdSchema,
  checkUniqueElementIds,
} from "./common.js";

export const COMPARISON_CHANGE_TYPE = "QUANTITY_COMPARISON_CHANGE" as const;
export const comparisonQuestionSchema = z.strictObject({
  id: gameElementIdSchema,
  mode: z.enum(["COMPARE", "ADD", "REMOVE"]),
  assetId: gameAssetIdSchema,
  label: z.string().trim().min(1).max(120).optional(),
  initialCount: z.number().int().min(0).max(10),
  targetCount: z.number().int().min(0).max(10),
  instruction: z.string().trim().min(1).max(500),
});
export const comparisonChangeStructureSchema = z.strictObject({
  ...baseContentShape,
  gameType: z.literal(COMPARISON_CHANGE_TYPE),
  items: z.array(assetItemSchema).min(1).max(3),
  basketAssetId: gameAssetIdSchema,
  questions: z.array(comparisonQuestionSchema).length(3),
  completionRule: z.literal("ALL_QUESTIONS_COMPLETED"),
});
export const comparisonChangeSchema =
  comparisonChangeStructureSchema.superRefine((content, ctx) => {
    checkUniqueElementIds(
      [
        { key: "items", items: content.items },
        { key: "questions", items: content.questions },
      ],
      ctx,
    );
    const modes = ["COMPARE", "ADD", "REMOVE"];
    content.questions.forEach((q, index) => {
      const issue = (message: string) =>
        ctx.addIssue({ code: "custom", path: ["questions", index], message });
      if (q.mode !== modes[index])
        issue("Exactly three rounds in order: COMPARE, ADD, REMOVE.");
      if (!content.items.some((item) => item.assetId === q.assetId))
        issue("Question must reference a supplied picture.");
      if (q.mode === "ADD" && q.targetCount <= q.initialCount)
        issue("ADD must increase quantity.");
      if (q.mode === "REMOVE" && q.targetCount >= q.initialCount)
        issue("REMOVE must decrease quantity.");
    });
  });
export type ComparisonChangeContent = z.infer<typeof comparisonChangeSchema>;
export type ComparisonQuestion = z.infer<typeof comparisonQuestionSchema>;
export function comparisonRelation(
  left: number,
  right: number,
): "GT" | "LT" | "EQ" {
  return left > right ? "GT" : left < right ? "LT" : "EQ";
}
