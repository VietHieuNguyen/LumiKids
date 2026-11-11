import { z } from "zod";
import { gameElementIdSchema } from "./common.js";

export const GAME_INTERACTION_SCHEMA_VERSION = 1 as const;
export const interactionResultSchema = z.enum(["CORRECT", "INCORRECT"]);
export type InteractionResult = z.infer<typeof interactionResultSchema>;

const eventShape = {
  schemaVersion: z.literal(GAME_INTERACTION_SCHEMA_VERSION),
  eventId: z.uuid(),
  sourceId: gameElementIdSchema,
  result: interactionResultSchema,
  timestamp: z.iso.datetime({ offset: true }),
  // 1-based, scoped to one task execution; monotonicity is a future runtime/server concern.
  attemptIndex: z.number().int().positive(),
};

export const countingInteractionSchema = z.strictObject({
  ...eventShape,
  actionType: z.literal("SELECT_CHOICE"),
  // sourceId identifies the selected choice. No targetId is accepted.
});
export const matchingInteractionSchema = z.strictObject({
  ...eventShape,
  actionType: z.literal("MATCH_DROP"),
  targetId: gameElementIdSchema,
});
export const classificationInteractionSchema = z.strictObject({
  ...eventShape,
  actionType: z.literal("CLASSIFY_DROP"),
  targetId: gameElementIdSchema,
});
export const gameInteractionSchema = z.discriminatedUnion("actionType", [
  countingInteractionSchema,
  matchingInteractionSchema,
  classificationInteractionSchema,
]);
export type CountingInteraction = z.infer<typeof countingInteractionSchema>;
export type MatchingInteraction = z.infer<typeof matchingInteractionSchema>;
export type ClassificationInteraction = z.infer<
  typeof classificationInteractionSchema
>;
export type GameInteraction = z.infer<typeof gameInteractionSchema>;
