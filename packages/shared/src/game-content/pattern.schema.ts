import { z } from "zod";
import {
  assetItemSchema,
  baseContentShape,
  checkUniqueElementIds,
  gameElementIdSchema,
} from "./common.js";

/** Repeating rules of Chỉ số 46; each letter is one distinct picture. */
export const patternRuleSchema = z.enum(["AB", "AAB", "ABB", "ABC", "AABB", "ABCD"]);
export type PatternRule = z.infer<typeof patternRuleSchema>;

/** One period of each rule as letter indexes (A = 0, B = 1, …). */
export const PATTERN_RULE_UNITS: Record<PatternRule, readonly number[]> = {
  AB: [0, 1],
  AAB: [0, 0, 1],
  ABB: [0, 1, 1],
  ABC: [0, 1, 2],
  AABB: [0, 0, 1, 1],
  ABCD: [0, 1, 2, 3],
};
export function patternLetterCount(rule: PatternRule): number {
  return Math.max(...PATTERN_RULE_UNITS[rule]) + 1;
}

export const patternSequenceSchema = z.strictObject({
  id: gameElementIdSchema,
  rule: patternRuleSchema,
  // Visible cells in display order; the blank always follows the last cell.
  cells: z.array(gameElementIdSchema).min(4).max(8),
  choiceIds: z.array(gameElementIdSchema).min(2).max(3),
  correctItemId: gameElementIdSchema,
});
export type PatternSequence = z.infer<typeof patternSequenceSchema>;

export const patternContentStructureSchema = z.strictObject({
  ...baseContentShape,
  gameType: z.literal("PATTERN"),
  items: z.array(assetItemSchema).min(2).max(4),
  sequences: z.array(patternSequenceSchema).min(3).max(6),
  completionRule: z.literal("ALL_SEQUENCES_COMPLETED"),
});

export const patternContentSchema = patternContentStructureSchema.superRefine(
  (content, context) => {
    checkUniqueElementIds(
      [
        { key: "items", items: content.items },
        { key: "sequences", items: content.sequences },
      ],
      context,
    );
    const assetIds = new Set<string>();
    content.items.forEach((item, index) => {
      if (assetIds.has(item.assetId))
        context.addIssue({
          code: "custom",
          path: ["items", index, "assetId"],
          message: "Each pattern item must use a different picture.",
        });
      assetIds.add(item.assetId);
    });
    const itemIds = new Set(content.items.map((item) => item.id));
    content.sequences.forEach((sequence, index) => {
      const path = ["sequences", index];
      const issue = (key: string, message: string) =>
        context.addIssue({ code: "custom", path: [...path, key], message });
      const refs = [...sequence.cells, ...sequence.choiceIds, sequence.correctItemId];
      if (refs.some((id) => !itemIds.has(id)))
        return issue("cells", "Sequence references must exist in items.");
      const units = PATTERN_RULE_UNITS[sequence.rule];
      if (sequence.cells.length < 2 * units.length)
        return issue("cells", "A sequence must show its rule at least twice.");
      const letters = new Map<number, string>();
      const brokenAt = sequence.cells.findIndex((cell, position) => {
        const letter = units[position % units.length];
        const known = letters.get(letter);
        if (known) return known !== cell;
        if ([...letters.values()].includes(cell)) return true;
        letters.set(letter, cell);
        return false;
      });
      if (brokenAt >= 0 || letters.size !== patternLetterCount(sequence.rule))
        return issue("cells", "Cells must repeat the rule with distinct pictures.");
      const expected = letters.get(units[sequence.cells.length % units.length]);
      if (sequence.correctItemId !== expected)
        issue("correctItemId", "The correct item must continue the rule.");
      if (new Set(sequence.choiceIds).size !== sequence.choiceIds.length)
        issue("choiceIds", "Choices must be distinct.");
      if (!sequence.choiceIds.includes(sequence.correctItemId))
        issue("choiceIds", "The correct item must be one of the choices.");
    });
  },
);
export type PatternContent = z.infer<typeof patternContentSchema>;
