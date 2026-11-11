import { z } from "zod";
import {
  assetItemSchema,
  baseContentShape,
  checkUniqueElementIds,
  gameAssetIdSchema,
  gameElementIdSchema,
} from "./common.js";

export const classificationItemSchema = assetItemSchema.extend({
  correctGroupId: gameElementIdSchema,
});
export type ClassificationItem = z.infer<typeof classificationItemSchema>;
export const classificationGroupSchema = z.strictObject({
  id: gameElementIdSchema,
  label: z.string().trim().min(1).max(120),
  assetId: gameAssetIdSchema.optional(),
});
export type ClassificationGroup = z.infer<typeof classificationGroupSchema>;

export const classificationContentStructureSchema = z.strictObject({
  ...baseContentShape,
  gameType: z.literal("CLASSIFICATION"),
  items: z.array(classificationItemSchema).min(1).max(50),
  groups: z.array(classificationGroupSchema).min(2).max(10),
  completionRule: z.literal("ALL_ITEMS_CLASSIFIED_CORRECTLY"),
});

export const classificationContentSchema =
  classificationContentStructureSchema.superRefine((content, context) => {
    checkUniqueElementIds(
      [
        { key: "items", items: content.items },
        { key: "groups", items: content.groups },
      ],
      context,
    );
    const groupIds = new Set(content.groups.map((group) => group.id));
    content.items.forEach((item, index) => {
      if (!groupIds.has(item.correctGroupId))
        context.addIssue({
          code: "custom",
          path: ["items", index, "correctGroupId"],
          message: "The correct group does not exist.",
        });
    });
  });

export const classificationItemV2Schema = assetItemSchema.extend({
  correctGroupIds: z.array(gameElementIdSchema).min(1).max(10),
});
export const classificationContentV2StructureSchema = z.strictObject({
  ...baseContentShape,
  schemaVersion: z.literal(2),
  gameType: z.literal("CLASSIFICATION"),
  items: z.array(classificationItemV2Schema).min(1).max(50),
  groups: z.array(classificationGroupSchema).min(2).max(10),
  completionRule: z.literal("ALL_ITEMS_CLASSIFIED_CORRECTLY"),
});
export const classificationContentV2Schema =
  classificationContentV2StructureSchema.superRefine((content, context) => {
    checkUniqueElementIds(
      [
        { key: "items", items: content.items },
        { key: "groups", items: content.groups },
      ],
      context,
    );
    const groupIds = new Set(content.groups.map((group) => group.id));
    content.items.forEach((item, index) => {
      if (new Set(item.correctGroupIds).size !== item.correctGroupIds.length)
        context.addIssue({
          code: "custom",
          path: ["items", index, "correctGroupIds"],
          message: "Accepted groups must be unique.",
        });
      item.correctGroupIds.forEach((groupId, groupIndex) => {
        if (!groupIds.has(groupId))
          context.addIssue({
            code: "custom",
            path: ["items", index, "correctGroupIds", groupIndex],
            message: "The accepted group does not exist.",
          });
      });
    });
  });
export type ClassificationContentV1 = z.infer<
  typeof classificationContentSchema
>;
export type ClassificationContentV2 = z.infer<
  typeof classificationContentV2Schema
>;
export type ClassificationContent =
  ClassificationContentV1 | ClassificationContentV2;

/** A child places each item once, into ANY accepted group. v1 remains unchanged. */
export function getClassificationCorrectGroupIds(
  item: ClassificationContent["items"][number],
): readonly string[] {
  return "correctGroupIds" in item
    ? item.correctGroupIds
    : [item.correctGroupId];
}
