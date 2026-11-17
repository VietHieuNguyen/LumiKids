import { z } from "zod";

/**
 * Assessment contracts. One ActivityVersion is assessed for exactly one AssessmentCriterion,
 * so a COMPLETED PlaySession produces at most one CriterionEvaluation.
 * The score is computed by the server only (InteractionEvent replay); LEVEL and summary come later.
 */
export const criterionLevelSchema = z.enum([
  "LEVEL_0",
  "LEVEL_1",
  "LEVEL_2",
  "LEVEL_3",
  "LEVEL_4",
]);

/** Item counts for the session's single criterion. F and R are mutually exclusive. */
export const criterionPerformanceSchema = z.object({
  /** N: scored items of the criterion, taken from the version content (not from events). */
  totalScoredItems: z.number().int().min(0),
  finalizedScoredItems: z.number().int().min(0),
  /** F: items solved on the first attempt. */
  firstAttemptCorrectCount: z.number().int().min(0),
  /** R: items answered wrong first, then corrected. */
  retryCorrectCount: z.number().int().min(0),
  attemptCount: z.number().int().min(0),
});

/** Value object of a PlaySession, derived from its InteractionEvents. Not used for the score. */
export const sessionPerformanceSchema = z.object({
  totalItemCount: z.number().int().min(0),
  finalizedItemCount: z.number().int().min(0),
  attemptCount: z.number().int().min(0),
  /** Seconds from session start to completion; pauses are not tracked yet. */
  completionDurationSeconds: z.number().min(0).nullable(),
  criterionCode: z.string().nullable(),
  criterionPerformance: criterionPerformanceSchema,
});

export const criterionEvaluationViewSchema = z.object({
  criterionCode: z.string(),
  criterionDescription: z.string(),
  /** Unrounded percentage 0–100; round only for display. Null when the version has no item. */
  score: z.number().min(0).max(100).nullable(),
  /** Not computed yet (AI/RAG phase). */
  level: criterionLevelSchema.nullable(),
  summary: z.string().nullable(),
  /** Trial rule: a valid session needs at least this many scored items (otherwise LEVEL_0 later). */
  minimumItemsMet: z.boolean(),
  ruleVersion: z.string(),
  performance: criterionPerformanceSchema,
});

export type CriterionLevel = z.infer<typeof criterionLevelSchema>;
export type CriterionPerformance = z.infer<typeof criterionPerformanceSchema>;
export type SessionPerformance = z.infer<typeof sessionPerformanceSchema>;
export type CriterionEvaluationView = z.infer<
  typeof criterionEvaluationViewSchema
>;
