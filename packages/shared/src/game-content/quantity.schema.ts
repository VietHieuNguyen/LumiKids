import { z } from "zod";
import {
  assetItemSchema,
  baseContentShape,
  gameAssetIdSchema,
  gameElementIdSchema,
  checkUniqueElementIds,
} from "./common.js";

export const quantityOptionsSchema = z
  .strictObject({
    mode: z.enum(["MERGE", "SPLIT"]),
    fruits: z
      .array(
        z.strictObject({
          name: z.string().trim().min(1).max(120),
          available: z.number().int().min(1).max(10),
          required: z.number().int().min(1).max(10),
        }),
      )
      .min(1)
      .max(4),
    splitCounts: z.array(z.number().int().min(1).max(9)).min(2).max(3),
  })
  .superRefine((value, ctx) => {
    const total = value.fruits.reduce((sum, fruit) => sum + fruit.available, 0);
    if (
      total > 10 ||
      (value.mode === "MERGE" &&
        value.fruits.some((fruit) => fruit.required > fruit.available))
    )
      ctx.addIssue({
        code: "custom",
        message: "Số lượng phải trong phạm vi mười và đủ quả để chơi.",
      });
    if (
      value.mode === "SPLIT" &&
      (value.fruits.length !== 1 ||
        value.splitCounts.reduce((a, b) => a + b, 0) !== total)
    )
      ctx.addIssue({
        code: "custom",
        message: "Tách một loại quả vào các giỏ có tổng bằng số quả ban đầu.",
      });
  });
export type QuantityOptions = z.infer<typeof quantityOptionsSchema>;
export const quantityContentStructureSchema = z.strictObject({
  ...baseContentShape,
  gameType: z.literal("QUANTITY"),
  mode: z.enum(["MERGE", "SPLIT"]),
  basketAssetId: gameAssetIdSchema.optional(),
  items: z.array(assetItemSchema).min(1).max(10),
  baskets: z
    .array(
      z.strictObject({
        id: gameElementIdSchema,
        label: z.string().min(1).max(120),
        requirements: z
          .array(
            z.strictObject({
              assetId: gameAssetIdSchema,
              count: z.number().int().min(1).max(10),
            }),
          )
          .min(1)
          .max(4),
      }),
    )
    .min(1)
    .max(3),
  completionRule: z.literal("ALL_BASKETS_FILLED"),
});
export const quantityContentSchema = quantityContentStructureSchema.superRefine(
  (content, ctx) => {
    checkUniqueElementIds(
      [
        { key: "items", items: content.items },
        { key: "baskets", items: content.baskets },
      ],
      ctx,
    );
    const demand = new Map<string, number>();
    for (const basket of content.baskets) {
      if (
        new Set(basket.requirements.map((r) => r.assetId)).size !==
        basket.requirements.length
      )
        ctx.addIssue({
          code: "custom",
          message: "Duplicate basket requirement.",
        });
      for (const r of basket.requirements)
        demand.set(r.assetId, (demand.get(r.assetId) ?? 0) + r.count);
    }
    if (content.mode === "MERGE" && content.baskets.length !== 1)
      ctx.addIssue({
        code: "custom",
        message: "Merge requires exactly one basket.",
      });
    if (
      content.mode === "SPLIT" &&
      (content.baskets.length < 2 ||
        new Set(content.items.map((i) => i.assetId)).size !== 1 ||
        [...demand.values()].reduce((a, b) => a + b, 0) !==
          content.items.length)
    )
      ctx.addIssue({
        code: "custom",
        message: "Split must partition all fruit.",
      });
    for (const [id, count] of demand)
      if (content.items.filter((i) => i.assetId === id).length < count)
        ctx.addIssue({ code: "custom", message: "Insufficient fruit." });
  },
);
export type QuantityContent = z.infer<typeof quantityContentSchema>;
