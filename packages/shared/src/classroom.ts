import { z } from "zod";
import { gameTypeSchema } from "./game-content/common.js";
import { playSessionStatusSchema } from "./gameplay.js";
import { criterionEvaluationViewSchema } from "./assessment.js";

/** Calendar date "YYYY-MM-DD" (no time zone): school years and birthdays. */
const dateOnlySchema = z.iso.date();
const today = () => new Date().toISOString().slice(0, 10);

export const genderSchema = z.enum(["MALE", "FEMALE"]);
export const childStatusSchema = z.enum(["ACTIVE", "DISABLED"]);
export const classroomStatusSchema = z.enum(["ACTIVE", "ARCHIVED"]);

// ---------- Admin input ----------

export const createSchoolYearSchema = z
  .object({
    name: z.string().trim().min(1).max(50),
    startDate: dateOnlySchema,
    endDate: dateOnlySchema,
  })
  .strict()
  .refine((v) => v.endDate > v.startDate, {
    message: "Ngày kết thúc phải sau ngày bắt đầu.",
    path: ["endDate"],
  });
export const updateSchoolYearSchema = z
  .object({
    name: z.string().trim().min(1).max(50).optional(),
    startDate: dateOnlySchema.optional(),
    endDate: dateOnlySchema.optional(),
  })
  .strict();

export const classroomQuerySchema = z
  .object({
    schoolYearId: z.uuid().optional(),
    status: classroomStatusSchema.optional(),
  })
  .strict();
export const createClassroomSchema = z
  .object({
    className: z.string().trim().min(1).max(100),
    schoolYearId: z.uuid(),
    ageGroupId: z.string().min(1).max(20),
    /** A class always has a responsible teacher (at least one) from the moment it is created. */
    teacherUserIds: z.array(z.uuid()).min(1).max(10),
  })
  .strict();
export const updateClassroomSchema = z
  .object({
    className: z.string().trim().min(1).max(100).optional(),
    ageGroupId: z.string().min(1).max(20).optional(),
    status: classroomStatusSchema.optional(),
  })
  .strict();
export const addClassroomTeacherSchema = z.object({ userId: z.uuid() }).strict();

const childProfileShape = {
  fullName: z.string().trim().min(1).max(200),
  dob: dateOnlySchema.refine((value) => value <= today(), "Ngày sinh không hợp lệ."),
  gender: genderSchema,
};
/** A child profile may exist without a class (school staff create it first, a class is added later). */
export const createChildSchema = z
  .object({ ...childProfileShape, classId: z.uuid().optional() })
  .strict();
export const updateChildSchema = z
  .object({
    fullName: childProfileShape.fullName.optional(),
    dob: childProfileShape.dob.optional(),
    gender: genderSchema.optional(),
    status: childStatusSchema.optional(),
  })
  .strict();
export const transferChildSchema = z.object({ classId: z.uuid() }).strict();

/** Admins rename an age group; its age range stays fixed (R-01 and the scoring rules depend on it). */
export const updateAgeGroupSchema = z
  .object({ name: z.string().trim().min(1).max(50) })
  .strict();
/** The full new order of every age group, first shown first. */
export const reorderAgeGroupsSchema = z
  .object({ ageGroupIds: z.array(z.string().min(1).max(20)).min(1).max(20) })
  .strict()
  .refine((value) => new Set(value.ageGroupIds).size === value.ageGroupIds.length, "Nhóm tuổi bị lặp.");

export const playHistoryQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

// ---------- Responses ----------

export const ageGroupSchema = z.object({
  ageGroupId: z.string(),
  name: z.string(),
  minAge: z.number().int(),
  maxAge: z.number().int(),
});
export const schoolYearSchema = z.object({
  schoolYearId: z.uuid(),
  name: z.string(),
  startDate: dateOnlySchema,
  endDate: dateOnlySchema,
});
/** Admin catalogue rows: what uses each age group, so a rename is made knowingly. */
export const ageGroupUsageSchema = ageGroupSchema.extend({
  displayOrder: z.number().int(),
  classroomCount: z.number().int(),
  activeClassroomCount: z.number().int(),
  activityCount: z.number().int(),
  lessonPlanCount: z.number().int(),
});
export const schoolYearUsageSchema = schoolYearSchema.extend({
  classroomCount: z.number().int(),
  activeClassroomCount: z.number().int(),
  /** Children currently enrolled in this year's classes. */
  childCount: z.number().int(),
});
export const classroomTeacherSchema = z.object({
  userId: z.uuid(),
  fullName: z.string(),
  email: z.string(),
});
export const classroomSummarySchema = z.object({
  classId: z.uuid(),
  className: z.string(),
  status: classroomStatusSchema,
  schoolYear: schoolYearSchema,
  ageGroup: ageGroupSchema,
  teacherCount: z.number().int(),
  childCount: z.number().int(),
});
export const classroomChildSchema = z.object({
  childId: z.uuid(),
  fullName: z.string(),
  dob: dateOnlySchema,
  gender: genderSchema,
  status: childStatusSchema,
  /** When the current login code was issued; null = the child has no code yet. */
  loginCodeIssuedAt: z.iso.datetime().nullable(),
  enrolledAt: z.iso.datetime(),
});
export const classroomDetailSchema = classroomSummarySchema.extend({
  teachers: z.array(classroomTeacherSchema),
  children: z.array(classroomChildSchema),
});
export const enrollmentPeriodSchema = z.object({
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime().nullable(),
});
/** A child as seen from one class: only the periods spent in that class. */
export const classroomChildDetailSchema = classroomChildSchema
  .omit({ enrolledAt: true })
  .extend({
    currentlyEnrolled: z.boolean(),
    periods: z.array(enrollmentPeriodSchema),
  });
export const playHistoryItemSchema = z.object({
  sessionId: z.uuid(),
  versionId: z.uuid(),
  gameName: z.string(),
  gameType: gameTypeSchema,
  status: playSessionStatusSchema,
  /** Number of recorded answers (each counts as one attempt). */
  attemptCount: z.number().int(),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime().nullable(),
  /** Stored when the session completed; null for unfinished or unscored sessions. */
  evaluation: criterionEvaluationViewSchema.nullable(),
});
export const playHistoryPageSchema = z.object({
  items: z.array(playHistoryItemSchema),
  pagination: z.object({
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});
/** Returned exactly once when a teacher issues a code; it cannot be read again. */
export const issuedLoginCodeSchema = z.object({
  childId: z.uuid(),
  code: z.string(),
  issuedAt: z.iso.datetime(),
});

export const ageGroupListSchema = z.array(ageGroupSchema);
export const ageGroupUsageListSchema = z.array(ageGroupUsageSchema);
export const schoolYearUsageListSchema = z.array(schoolYearUsageSchema);
export const schoolYearListSchema = z.array(schoolYearSchema);
export const classroomTeacherListSchema = z.array(classroomTeacherSchema);
export const classroomSummaryListSchema = z.array(classroomSummarySchema);
/** A child's profile without class context (admin edit response). */
export const childProfileSchema = classroomChildSchema.omit({ enrolledAt: true });
export const childProfileListSchema = z.array(childProfileSchema);

export type CreateSchoolYearInput = z.infer<typeof createSchoolYearSchema>;
export type UpdateSchoolYearInput = z.infer<typeof updateSchoolYearSchema>;
export type ClassroomQuery = z.infer<typeof classroomQuerySchema>;
export type CreateClassroomInput = z.infer<typeof createClassroomSchema>;
export type UpdateClassroomInput = z.infer<typeof updateClassroomSchema>;
export type CreateChildInput = z.infer<typeof createChildSchema>;
export type UpdateChildInput = z.infer<typeof updateChildSchema>;
export type PlayHistoryQuery = z.infer<typeof playHistoryQuerySchema>;
export type AgeGroup = z.infer<typeof ageGroupSchema>;
export type AgeGroupUsage = z.infer<typeof ageGroupUsageSchema>;
export type SchoolYearUsage = z.infer<typeof schoolYearUsageSchema>;
export type UpdateAgeGroupInput = z.infer<typeof updateAgeGroupSchema>;
export type ReorderAgeGroupsInput = z.infer<typeof reorderAgeGroupsSchema>;
export type SchoolYear = z.infer<typeof schoolYearSchema>;
export type ClassroomTeacher = z.infer<typeof classroomTeacherSchema>;
export type ClassroomSummary = z.infer<typeof classroomSummarySchema>;
export type ClassroomChild = z.infer<typeof classroomChildSchema>;
export type ClassroomDetail = z.infer<typeof classroomDetailSchema>;
export type ClassroomChildDetail = z.infer<typeof classroomChildDetailSchema>;
export type PlayHistoryItem = z.infer<typeof playHistoryItemSchema>;
export type PlayHistoryPage = z.infer<typeof playHistoryPageSchema>;
export type IssuedLoginCode = z.infer<typeof issuedLoginCodeSchema>;
export type ChildProfile = z.infer<typeof childProfileSchema>;
