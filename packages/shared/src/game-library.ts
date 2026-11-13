import { z } from "zod";
import { gameContentSchema } from "./game-content/game-content.schema.js";
import { gameTypeSchema } from "./game-content/common.js";
import { gameDifficultySchema } from "./game-content/authoring.js";

export const assessmentCriterionSchema = z.object({
  criterionCode: z.string(),
  description: z.string(),
  skillCode: z.string(),
});
export const skillSchema = z.object({
  skillCode: z.string(),
  name: z.string(),
  description: z.string(),
  criterions: z.array(assessmentCriterionSchema),
});
export const curriculumSchema = z.array(skillSchema);
export const saveGameSchema = z
  .object({
    saveRequestId: z.uuid(),
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(1000).default(""),
    difficulty: gameDifficultySchema,
    criterionCodes: z
      .array(z.string().regex(/^\d{2}$/))
      .min(1)
      .max(11)
      .refine(
        (values) => new Set(values).size === values.length,
        "Duplicate criteria",
      ),
    content: gameContentSchema,
    previewToken: z.string().min(1).max(20000),
    reviewConfirmed: z.literal(true),
  })
  .strict();
export const gameLibraryQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(48).default(12),
    search: z.string().trim().max(200).default(""),
    gameType: gameTypeSchema.optional(),
    difficulty: gameDifficultySchema.optional(),
    skillCode: z
      .string()
      .regex(/^\d{2}$/)
      .optional(),
    criterionCode: z
      .string()
      .regex(/^\d{2}$/)
      .optional(),
    mine: z.enum(["true", "false"]).default("false"),
    status: z.enum(["ACTIVE", "ARCHIVED"]).default("ACTIVE"),
  })
  .strict();
export const gameStatusSchema = z
  .object({ status: z.enum(["ACTIVE", "ARCHIVED"]) })
  .strict();
export const savedGameSchema = z.object({
  activityId: z.uuid(),
  versionId: z.uuid(),
  versionNumber: z.number().int().positive(),
  name: z.string(),
  description: z.string(),
  gameType: gameTypeSchema,
  difficulty: gameDifficultySchema,
  status: z.enum(["ACTIVE", "ARCHIVED"]),
  createdBy: z.uuid(),
  creatorName: z.string(),
  createdAt: z.iso.datetime(),
  criterions: z.array(assessmentCriterionSchema),
  coverAssetIds: z.array(z.uuid()),
});
export const savedGameDetailSchema = savedGameSchema.extend({
  content: gameContentSchema,
});
export const gameLibraryPageSchema = z.object({
  items: z.array(savedGameSchema),
  pagination: z.object({
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});
export type Skill = z.infer<typeof skillSchema>;
export type AssessmentCriterion = z.infer<typeof assessmentCriterionSchema>;
export type SaveGameInput = z.infer<typeof saveGameSchema>;
export type GameLibraryQuery = z.infer<typeof gameLibraryQuerySchema>;
export type SavedGame = z.infer<typeof savedGameSchema>;
export type SavedGameDetail = z.infer<typeof savedGameDetailSchema>;
export type GameLibraryPage = z.infer<typeof gameLibraryPageSchema>;
