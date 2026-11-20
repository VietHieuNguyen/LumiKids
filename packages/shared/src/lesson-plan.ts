import { z } from "zod";
import { gameTypeSchema } from "./game-content/common.js";

export const MAX_LESSON_BLOCKS = 30;
export const lessonPlanStatusSchema = z.enum(["DRAFT", "COMPLETE"]);

const text = (max: number) => z.string().trim().max(max);
const minutes = (max: number) => z.number().int().min(1).max(max).nullable();

export const lessonBlockInputSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    instruction: text(4000).default(""),
    durationMinutes: minutes(240).default(null),
    /** A saved library game used in this step (optional). */
    versionId: z.uuid().nullable().default(null),
  })
  .strict();

const planFields = {
  title: z.string().trim().min(1).max(200),
  topic: text(200).default(""),
  ageGroupId: z.string().max(20).nullable().default(null),
  skillCode: z.string().regex(/^\d{2}$/).nullable().default(null),
  durationMinutes: minutes(480).default(null),
  objectives: text(4000).default(""),
  preparation: text(4000).default(""),
  evaluation: text(4000).default(""),
  /** Blocks in display order; positions are taken from this order. */
  blocks: z.array(lessonBlockInputSchema).max(MAX_LESSON_BLOCKS).default([]),
};
export const createLessonPlanSchema = z.object(planFields).strict();
/** A full save. `revision` is the revision the editor loaded; a newer one on the server is a conflict. */
export const saveLessonPlanSchema = z
  .object({ ...planFields, status: lessonPlanStatusSchema, revision: z.number().int().positive() })
  .strict();
export const lessonPlanQuerySchema = z
  .object({
    search: z.string().trim().max(200).default(""),
    status: lessonPlanStatusSchema.optional(),
    ageGroupId: z.string().max(20).optional(),
    skillCode: z.string().regex(/^\d{2}$/).optional(),
  })
  .strict();

export const lessonBlockSchema = z.object({
  blockId: z.uuid(),
  position: z.number().int(),
  title: z.string(),
  instruction: z.string(),
  durationMinutes: z.number().int().nullable(),
  game: z
    .object({
      versionId: z.uuid(),
      name: z.string(),
      gameType: gameTypeSchema,
      /** False once the game is archived in the library. */
      available: z.boolean(),
    })
    .nullable(),
});
export const lessonPlanSummarySchema = z.object({
  lessonPlanId: z.uuid(),
  title: z.string(),
  topic: z.string(),
  ageGroupId: z.string().nullable(),
  ageGroupName: z.string().nullable(),
  skillCode: z.string().nullable(),
  skillName: z.string().nullable(),
  durationMinutes: z.number().int().nullable(),
  status: lessonPlanStatusSchema,
  revision: z.number().int(),
  blockCount: z.number().int(),
  gameCount: z.number().int(),
  updatedAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});
export const lessonPlanListSchema = z.array(lessonPlanSummarySchema);
export const lessonPlanSchema = lessonPlanSummarySchema.extend({
  objectives: z.string(),
  preparation: z.string(),
  evaluation: z.string(),
  sourceLessonPlanId: z.uuid().nullable(),
  updatedByName: z.string(),
  blocks: z.array(lessonBlockSchema),
});

export type LessonPlanStatus = z.infer<typeof lessonPlanStatusSchema>;
export type LessonBlockInput = z.input<typeof lessonBlockInputSchema>;
export type CreateLessonPlanInput = z.input<typeof createLessonPlanSchema>;
export type SaveLessonPlanInput = z.input<typeof saveLessonPlanSchema>;
export type SaveLessonPlanData = z.infer<typeof saveLessonPlanSchema>;
export type LessonPlanQuery = z.infer<typeof lessonPlanQuerySchema>;
export type LessonBlock = z.infer<typeof lessonBlockSchema>;
export type LessonPlanSummary = z.infer<typeof lessonPlanSummarySchema>;
export type LessonPlan = z.infer<typeof lessonPlanSchema>;
