import { z } from "zod";
import { gameTypeSchema } from "./game-content/common.js";
import { gameDifficultySchema } from "./game-content/authoring.js";
import { playableGameSchema } from "./gameplay.js";

export const MAX_GAMES_PER_ASSIGNMENT = 10;
export const MAX_GROUP_MEMBERS = 100;

const childIdsSchema = z
  .array(z.uuid())
  .max(MAX_GROUP_MEMBERS)
  .refine((values) => new Set(values).size === values.length, "Duplicate children");

// ---------- Groups ----------

export const createClassGroupSchema = z
  .object({ name: z.string().trim().min(1).max(100), childIds: childIdsSchema })
  .strict();
export const updateClassGroupSchema = z
  .object({ name: z.string().trim().min(1).max(100).optional(), childIds: childIdsSchema.optional() })
  .strict();
export const classGroupSchema = z.object({
  groupId: z.uuid(),
  name: z.string(),
  /** Only children currently in the class; members who moved away are not listed. */
  childIds: z.array(z.uuid()),
});
export const classGroupListSchema = z.array(classGroupSchema);

// ---------- Assignments: teacher input ----------

export const assignmentTargetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("CLASS") }).strict(),
  z.object({ type: z.literal("GROUP"), groupId: z.uuid() }).strict(),
  z.object({ type: z.literal("CHILDREN"), childIds: childIdsSchema.min(1) }).strict(),
]);
export const createAssignmentSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    note: z.string().trim().max(1000).default(""),
    /** Defaults to now. */
    opensAt: z.iso.datetime().optional(),
    dueAt: z.iso.datetime().nullable().default(null),
    versionIds: z
      .array(z.uuid())
      .min(1)
      .max(MAX_GAMES_PER_ASSIGNMENT)
      .refine((values) => new Set(values).size === values.length, "Duplicate games"),
    target: assignmentTargetSchema,
  })
  .strict();
export const updateAssignmentSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    note: z.string().trim().max(1000).optional(),
    dueAt: z.iso.datetime().nullable().optional(),
    status: z.literal("CANCELLED").optional(),
  })
  .strict();
/** A teacher re-opens an assignment for some children until a new deadline ("giao lại"). */
export const extendAssignmentSchema = z
  .object({ childIds: childIdsSchema.min(1), until: z.iso.datetime() })
  .strict();
export const decideReplaySchema = z
  .object({ approve: z.boolean(), until: z.iso.datetime().optional() })
  .strict()
  .refine((value) => !value.approve || value.until !== undefined, {
    message: "An approval needs a new deadline.",
    path: ["until"],
  });

// ---------- Assignments: responses ----------

export const assignmentStateSchema = z.enum(["UPCOMING", "OPEN", "CLOSED", "CANCELLED"]);
export const assignmentTargetTypeSchema = z.enum(["CLASS", "GROUP", "CHILDREN"]);
export const completionStatusSchema = z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED"]);
export const replayRequestStatusSchema = z.enum(["PENDING", "APPROVED", "REJECTED"]);

export const assignmentSummarySchema = z.object({
  assignmentId: z.uuid(),
  title: z.string(),
  note: z.string(),
  opensAt: z.iso.datetime(),
  dueAt: z.iso.datetime().nullable(),
  state: assignmentStateSchema,
  targetType: assignmentTargetTypeSchema,
  targetLabel: z.string(),
  createdByName: z.string(),
  gameCount: z.number().int(),
  recipientCount: z.number().int(),
  completedCount: z.number().int(),
  pendingReplayCount: z.number().int(),
});
export const assignmentSummaryListSchema = z.array(assignmentSummarySchema);
export const assignmentGameSchema = z.object({
  versionId: z.uuid(),
  name: z.string(),
  gameType: gameTypeSchema,
  difficulty: gameDifficultySchema,
  /** False once the game is archived: children can no longer start it. */
  available: z.boolean(),
});
export const assignmentRecipientSchema = z.object({
  childId: z.uuid(),
  fullName: z.string(),
  /** False when the child has moved to another class since. */
  inClass: z.boolean(),
  extendedUntil: z.iso.datetime().nullable(),
  completedVersionIds: z.array(z.uuid()),
  completionStatus: completionStatusSchema,
  pendingReplay: z.object({ requestId: z.uuid(), requestedAt: z.iso.datetime() }).nullable(),
});
export const assignmentDetailSchema = assignmentSummarySchema.extend({
  games: z.array(assignmentGameSchema),
  recipients: z.array(assignmentRecipientSchema),
});

// ---------- Child view ----------

export const childAssignmentGameSchema = playableGameSchema.extend({
  completed: z.boolean(),
  available: z.boolean(),
});
export const childAssignmentSchema = z.object({
  assignmentId: z.uuid(),
  title: z.string(),
  note: z.string(),
  dueAt: z.iso.datetime().nullable(),
  /** Deadline that applies to this child (an extension may be later than dueAt); null = no deadline. */
  playableUntil: z.iso.datetime().nullable(),
  state: z.enum(["OPEN", "CLOSED"]),
  completionStatus: completionStatusSchema,
  games: z.array(childAssignmentGameSchema),
  replayRequest: z
    .object({
      status: replayRequestStatusSchema,
      requestedAt: z.iso.datetime(),
      grantedUntil: z.iso.datetime().nullable(),
    })
    .nullable(),
});
export const childAssignmentListSchema = z.array(childAssignmentSchema);

export type CreateClassGroupInput = z.infer<typeof createClassGroupSchema>;
export type UpdateClassGroupInput = z.infer<typeof updateClassGroupSchema>;
export type ClassGroup = z.infer<typeof classGroupSchema>;
export type AssignmentTarget = z.infer<typeof assignmentTargetSchema>;
export type CreateAssignmentInput = z.input<typeof createAssignmentSchema>;
export type CreateAssignmentData = z.infer<typeof createAssignmentSchema>;
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;
export type ExtendAssignmentInput = z.infer<typeof extendAssignmentSchema>;
export type DecideReplayInput = z.infer<typeof decideReplaySchema>;
export type AssignmentState = z.infer<typeof assignmentStateSchema>;
export type CompletionStatus = z.infer<typeof completionStatusSchema>;
export type AssignmentSummary = z.infer<typeof assignmentSummarySchema>;
export type AssignmentGame = z.infer<typeof assignmentGameSchema>;
export type AssignmentRecipient = z.infer<typeof assignmentRecipientSchema>;
export type AssignmentDetail = z.infer<typeof assignmentDetailSchema>;
export type ChildAssignmentGame = z.infer<typeof childAssignmentGameSchema>;
export type ChildAssignment = z.infer<typeof childAssignmentSchema>;
