import { z } from "zod";
import {
  countingContentSchema,
  countingContentStructureSchema,
  countingContentV2Schema,
  countingContentV2StructureSchema,
} from "./counting.schema.js";
import {
  matchingContentSchema,
  matchingContentStructureSchema,
} from "./matching.schema.js";
import {
  classificationContentSchema,
  classificationContentStructureSchema,
  classificationContentV2Schema,
  classificationContentV2StructureSchema,
} from "./classification.schema.js";

/** Structure only: useful for distinguishing malformed JSON from inconsistent answers. */
const gameContentV1StructureSchema = z.discriminatedUnion("gameType", [
  countingContentStructureSchema,
  matchingContentStructureSchema,
  classificationContentStructureSchema,
]);

/** Use this at trust boundaries: validates structure AND task/answer consistency. */
export const gameContentV1Schema = z.discriminatedUnion("gameType", [
  countingContentSchema,
  matchingContentSchema,
  classificationContentSchema,
]);

export const gameContentStructureSchema = z.union([
  gameContentV1StructureSchema,
  classificationContentV2StructureSchema,
  countingContentV2StructureSchema,
]);
export const gameContentV2Schema = z.discriminatedUnion("gameType", [
  countingContentV2Schema,
  classificationContentV2Schema,
]);
export const gameContentSchema = z.union([
  gameContentV1Schema,
  gameContentV2Schema,
]);
export type GameContentV1 = z.infer<typeof gameContentV1Schema>;
export type GameContent = z.infer<typeof gameContentSchema>;
