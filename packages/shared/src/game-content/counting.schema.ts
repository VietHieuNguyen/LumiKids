import { z } from "zod";
import {
  assetItemSchema,
  baseContentShape,
  checkUniqueElementIds,
  gameElementIdSchema,
} from "./common.js";

export const countingChoiceSchema = z.strictObject({
  id: gameElementIdSchema,
  value: z.number().int().min(0).max(20),
});
export type CountingChoice = z.infer<typeof countingChoiceSchema>;

export const countingContentStructureSchema = z.strictObject({
  ...baseContentShape,
  gameType: z.literal("COUNTING"),
  items: z.array(assetItemSchema).min(1).max(20),
  choices: z.array(countingChoiceSchema).min(2).max(6),
  correctChoiceId: gameElementIdSchema,
  completionRule: z.literal("CORRECT_CHOICE"),
});

export const countingContentSchema = countingContentStructureSchema.superRefine(
  (content, context) => {
    checkUniqueElementIds(
      [
        { key: "items", items: content.items },
        { key: "choices", items: content.choices },
      ],
      context,
    );
    const values = new Set<number>();
    content.choices.forEach((choice, index) => {
      if (values.has(choice.value)) {
        context.addIssue({
          code: "custom",
          path: ["choices", index, "value"],
          message: "Counting choices must have distinct numeric values.",
        });
      }
      values.add(choice.value);
    });
    const correct = content.choices.find(
      (choice) => choice.id === content.correctChoiceId,
    );
    if (!correct) {
      context.addIssue({
        code: "custom",
        path: ["correctChoiceId"],
        message: "The correct choice must exist in choices.",
      });
    } else if (correct.value !== content.items.length) {
      context.addIssue({
        code: "custom",
        path: ["correctChoiceId"],
        message: "The correct choice value must equal the number of items.",
      });
    }
  },
);

export const countingColorSchema = z.enum([
  "RED",
  "BLUE",
  "GREEN",
  "YELLOW",
  "PURPLE",
  "ORANGE",
  "WHITE",
  "BLACK",
]);
export const countingRuleSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("ALL") }),
  z.strictObject({ type: z.literal("COLOR"), color: countingColorSchema }),
  z.strictObject({
    type: z.literal("OBJECT_TYPE"),
    objectType: z.string().regex(/^[A-Z][A-Z0-9_]{0,39}$/),
    color: countingColorSchema.optional(),
  }),
]);
export const countingContentV2StructureSchema =
  countingContentStructureSchema.extend({
    schemaVersion: z.literal(2),
    countingRule: countingRuleSchema,
    countedItemIds: z.array(gameElementIdSchema).min(1).max(20),
  });
export const countingContentV2Schema =
  countingContentV2StructureSchema.superRefine((content, context) => {
    checkUniqueElementIds(
      [
        { key: "items", items: content.items },
        { key: "choices", items: content.choices },
      ],
      context,
    );
    const itemIds = new Set(content.items.map((item) => item.id));
    const counted = new Set(content.countedItemIds);
    if (counted.size !== content.countedItemIds.length)
      context.addIssue({
        code: "custom",
        path: ["countedItemIds"],
        message: "Counted item IDs must be unique.",
      });
    content.countedItemIds.forEach((id, index) => {
      if (!itemIds.has(id))
        context.addIssue({
          code: "custom",
          path: ["countedItemIds", index],
          message: "Counted item must exist in items.",
        });
    });
    if (
      content.countingRule.type === "ALL" &&
      (counted.size !== itemIds.size ||
        [...itemIds].some((id) => !counted.has(id)))
    )
      context.addIssue({
        code: "custom",
        path: ["countedItemIds"],
        message: "ALL must count every displayed item.",
      });
    const values = new Set<number>();
    content.choices.forEach((choice, index) => {
      if (values.has(choice.value))
        context.addIssue({
          code: "custom",
          path: ["choices", index, "value"],
          message: "Counting choices must have distinct values.",
        });
      values.add(choice.value);
    });
    const correct = content.choices.find(
      (choice) => choice.id === content.correctChoiceId,
    );
    if (!correct || correct.value !== counted.size)
      context.addIssue({
        code: "custom",
        path: ["correctChoiceId"],
        message: "Correct choice must equal the number of counted items.",
      });
  });
export type CountingContentV1 = z.infer<typeof countingContentSchema>;
export type CountingContentV2 = z.infer<typeof countingContentV2Schema>;
export type CountingContent = CountingContentV1 | CountingContentV2;
export type CountingColor = z.infer<typeof countingColorSchema>;

export function getCountedItemIds(content: CountingContent): readonly string[] {
  return content.schemaVersion === 1
    ? content.items.map((item) => item.id)
    : content.countedItemIds;
}
