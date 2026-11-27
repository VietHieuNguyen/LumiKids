import { z } from "zod";
import { childProfileSchema, issuedLoginCodeSchema } from "./classroom.js";

export const CLASSROOM_BATCH_LIMIT = 100;
const ids = z.array(z.uuid()).min(1).max(CLASSROOM_BATCH_LIMIT)
  .refine((values) => new Set(values.map((id) => id.toLowerCase())).size === values.length);

export const childBatchSchema = z.object({ childIds: ids }).strict();
export const joinRequestBatchSchema = z.object({ requestIds: ids }).strict();
/** Places children without a class and moves children from another class (school profiles only when unplaced). */
export const enrollmentBatchSchema = childBatchSchema.extend({ classId: z.uuid() });
export const childStatusBatchSchema = childBatchSchema.extend({ status: z.enum(["ACTIVE", "DISABLED"]) });

const skippedItem = z.object({
  id: z.uuid(),
  reason: z.enum(["NOT_ELIGIBLE", "FAMILY_PROFILE", "HAS_CLASS", "SAME_CLASS", "UNCHANGED", "ALREADY_DECIDED", "AGE_REVIEW", "FAILED"]),
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

/** Every child profile for the admin directory, with the class the child is in now (if any). */
export const adminChildSchema = childProfileSchema.extend({
  createdAt: z.iso.datetime(),
  managedByFamily: z.boolean(),
  currentClass: z.object({
    classId: z.uuid(),
    className: z.string(),
    schoolYearName: z.string(),
    ageGroupName: z.string(),
    since: z.iso.datetime(),
  }).nullable(),
});

/** Server-side filters and paging for the admin child directory (query string values). */
export const adminChildFilterSchema = z.object({
  q: z.string().trim().max(100).default(""),
  /** A class id, "none" (not placed) or "" (any). */
  classId: z.union([z.uuid(), z.literal("none"), z.literal("")]).default(""),
  managed: z.enum(["", "SCHOOL", "FAMILY"]).default(""),
  code: z.enum(["", "HAS", "NONE"]).default(""),
  status: z.enum(["", "ACTIVE", "DISABLED"]).default(""),
}).strict();
export const adminChildQuerySchema = adminChildFilterSchema.extend({
  sort: z.enum(["name", "dob", "createdAt"]).default("name"),
  dir: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
}).strict();
export const adminChildPageSchema = z.object({
  items: z.array(adminChildSchema),
  total: z.number().int(),
  /** Whole directory, unfiltered: the KPI row. */
  counts: z.object({
    all: z.number().int(),
    unassigned: z.number().int(),
    withoutCode: z.number().int(),
    disabled: z.number().int(),
  }),
});
/** Every id matching the filters, for "select all"; capped so a batch stays a few calls. */
export const ADMIN_CHILD_ID_LIMIT = 1000;
/** Just enough per child to preview a batch (who will be placed, moved or skipped). */
export const adminChildPickSchema = z.object({
  childId: z.uuid(),
  fullName: z.string(),
  status: z.enum(["ACTIVE", "DISABLED"]),
  classId: z.uuid().nullable(),
  managedByFamily: z.boolean(),
});
export const adminChildIdsSchema = z.object({ items: z.array(adminChildPickSchema), truncated: z.boolean() });
export type AdminChildPick = z.infer<typeof adminChildPickSchema>;

export type AdminChild = z.infer<typeof adminChildSchema>;
export type AdminChildFilter = z.infer<typeof adminChildFilterSchema>;
export type AdminChildQuery = z.infer<typeof adminChildQuerySchema>;
export type AdminChildPage = z.infer<typeof adminChildPageSchema>;
export type ClassroomBatchResult = z.infer<typeof classroomBatchResultSchema>;
export type InitialCodesResult = z.infer<typeof initialCodesResultSchema>;
