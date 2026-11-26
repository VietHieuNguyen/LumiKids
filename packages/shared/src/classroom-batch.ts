import { z } from "zod";
import { childProfileSchema, issuedLoginCodeSchema } from "./classroom.js";

export const CLASSROOM_BATCH_LIMIT = 100;
const ids = z.array(z.uuid()).min(1).max(CLASSROOM_BATCH_LIMIT)
  .refine((values) => new Set(values.map((id) => id.toLowerCase())).size === values.length);

export const childBatchSchema = z.object({ childIds: ids }).strict();
export const joinRequestBatchSchema = z.object({ requestIds: ids }).strict();
export const enrollmentBatchSchema = childBatchSchema.extend({ classId: z.uuid() });

const skippedItem = z.object({
  id: z.uuid(),
  reason: z.enum(["NOT_ELIGIBLE", "FAMILY_PROFILE", "HAS_CLASS", "ALREADY_DECIDED", "AGE_REVIEW", "FAILED"]),
});

export const classroomBatchResultSchema = z.object({
  completedIds: z.array(z.uuid()),
  skipped: z.array(skippedItem),
});

export const initialCodesResultSchema = z.object({
  issued: z.array(issuedLoginCodeSchema),
  skipped: z.array(skippedItem),
});

export const unassignedChildListSchema = z.array(childProfileSchema.extend({
  managedByFamily: z.boolean(),
}));

export type ClassroomBatchResult = z.infer<typeof classroomBatchResultSchema>;
export type InitialCodesResult = z.infer<typeof initialCodesResultSchema>;
