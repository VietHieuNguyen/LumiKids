import { z } from "zod";
import { gameContentSchema } from "./game-content/game-content.schema.js";
import { gameTypeSchema } from "./game-content/common.js";
import { gameDifficultySchema } from "./game-content/authoring.js";
import { gameInteractionSchema } from "./game-content/interaction.schema.js";

export const MAX_INTERACTIONS_PER_BATCH = 50;
export const MAX_INTERACTIONS_PER_SESSION = 500;

export const playSessionStatusSchema = z.enum([
  "IN_PROGRESS",
  "COMPLETED",
  "ABANDONED",
]);
export const playableGameQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(48).default(12),
    gameType: gameTypeSchema.optional(),
  })
  .strict();
export const playableGameSchema = z.object({
  versionId: z.uuid(),
  name: z.string(),
  gameType: gameTypeSchema,
  difficulty: gameDifficultySchema,
  coverAssetIds: z.array(z.uuid()),
});
export const playableGameDetailSchema = playableGameSchema.extend({
  content: gameContentSchema,
});
export const playableGamePageSchema = z.object({
  items: z.array(playableGameSchema),
  pagination: z.object({
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});
export const startPlaySessionSchema = z
  .object({ versionId: z.uuid(), startRequestId: z.uuid() })
  .strict();
export const submitInteractionsSchema = z
  .object({
    events: z
      .array(gameInteractionSchema)
      .min(1)
      .max(MAX_INTERACTIONS_PER_BATCH),
  })
  .strict();
export const playSessionSchema = z.object({
  sessionId: z.uuid(),
  versionId: z.uuid(),
  status: playSessionStatusSchema,
  nextAttemptIndex: z.number().int().positive(),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime().nullable(),
});
export const submitInteractionsResultSchema = playSessionSchema.extend({
  accepted: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
});

export type PlaySessionStatus = z.infer<typeof playSessionStatusSchema>;
export type PlayableGameQuery = z.infer<typeof playableGameQuerySchema>;
export type PlayableGame = z.infer<typeof playableGameSchema>;
export type PlayableGameDetail = z.infer<typeof playableGameDetailSchema>;
export type PlayableGamePage = z.infer<typeof playableGamePageSchema>;
export type StartPlaySessionInput = z.infer<typeof startPlaySessionSchema>;
export type SubmitInteractionsInput = z.infer<typeof submitInteractionsSchema>;
export type PlaySessionView = z.infer<typeof playSessionSchema>;
export type SubmitInteractionsResult = z.infer<
  typeof submitInteractionsResultSchema
>;

/**
 * "Góc của bé": what a signed-in child sees about themselves. No scores: results are for the
 * adults; the child sees what they finished and on which days they played.
 */
export const childCornerSchema = z.object({
  fullName: z.string(),
  classroom: z.object({ className: z.string(), teacherNames: z.array(z.string()) }).nullable(),
  /** Different games finished at least once. */
  finishedGames: z.number().int().nonnegative(),
  /** Finished plays, replays included. */
  finishedPlays: z.number().int().nonnegative(),
  /** Monday→Sunday of the current week (Vietnam time): true when a play was finished that day. */
  playedThisWeek: z.array(z.boolean()).length(7),
  /** Index of today in `playedThisWeek` (0 = Monday). */
  todayIndex: z.number().int().min(0).max(6),
  /** One sticker per finished game, latest first (at most 24). */
  stickers: z.array(
    z.object({
      versionId: z.uuid(),
      title: z.string(),
      gameType: gameTypeSchema,
      times: z.number().int().positive(),
      lastFinishedAt: z.iso.datetime(),
    }),
  ),
});
export type ChildCorner = z.infer<typeof childCornerSchema>;
