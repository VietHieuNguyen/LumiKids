import { z } from "zod";
import { gameElementIdSchema } from "./common.js";

export const GAME_INTERACTION_SCHEMA_VERSION = 1 as const;
export const interactionResultSchema = z.enum(["CORRECT", "INCORRECT"]);
export type InteractionResult = z.infer<typeof interactionResultSchema>;

const identityShape = {
  schemaVersion: z.literal(GAME_INTERACTION_SCHEMA_VERSION),
  eventId: z.uuid(),
  sourceId: gameElementIdSchema,
  timestamp: z.iso.datetime({ offset: true }),
  // 1-based sequence of the session's events (answers and hint requests); the server checks the order.
  attemptIndex: z.number().int().positive(),
};
const eventShape = { ...identityShape, result: interactionResultSchema };

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
/** PATTERN: sourceId names the sequence (the task), targetId the picture put in the blank. */
export const patternInteractionSchema = z.strictObject({
  ...eventShape,
  actionType: z.literal("FILL_PATTERN"),
  targetId: gameElementIdSchema,
});
/**
 * The child asked for a hint on one task. sourceId names the task: the correct choice of a COUNTING
 * question, the source of a MATCHING pair, the item of a CLASSIFICATION game. It is not an answer, so it
 * has no result; a task solved after its hint counts as H in ScoreCE.
 */
export const hintInteractionSchema = z.strictObject({
  ...identityShape,
  actionType: z.literal("REQUEST_HINT"),
});
export const gameInteractionSchema = z.discriminatedUnion("actionType", [
  countingInteractionSchema,
  matchingInteractionSchema,
  classificationInteractionSchema,
  patternInteractionSchema,
  hintInteractionSchema,
]);
export type CountingInteraction = z.infer<typeof countingInteractionSchema>;
export type MatchingInteraction = z.infer<typeof matchingInteractionSchema>;
export type ClassificationInteraction = z.infer<
  typeof classificationInteractionSchema
>;
export type PatternInteraction = z.infer<typeof patternInteractionSchema>;
export type HintInteraction = z.infer<typeof hintInteractionSchema>;
export type GameInteraction = z.infer<typeof gameInteractionSchema>;
/** An event that is an answer (has a result), as opposed to a hint request. */
export type AnswerInteraction = Exclude<GameInteraction, HintInteraction>;
export function isAnswerInteraction(event: GameInteraction): event is AnswerInteraction {
  return event.actionType !== "REQUEST_HINT";
}
