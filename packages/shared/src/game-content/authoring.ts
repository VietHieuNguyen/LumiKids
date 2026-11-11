import { z } from "zod";

/** Adult-assigned authoring metadata; never a score or automatic adaptation rule. */
export const gameDifficultySchema = z.enum(["EASY", "MEDIUM", "HARD"]);
export type GameDifficulty = z.infer<typeof gameDifficultySchema>;
