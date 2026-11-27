import { z } from "zod";

/**
 * FR-3.1 teacher assessments. Stored apart from automatic results: it never feeds SkillState or adaptive
 * decisions, and an edit keeps the replaced values in the revision history.
 */

const dateOnly = z.iso.date();

/** Chỉ số Nhận thức 42–52; 51 has no requirement to name the group (see system.md). */
export const assessmentCriterionCodeSchema = z.string().regex(/^(4[2-9]|5[0-2])$/, "Chỉ số phải nằm trong 42–52.");

export const teacherAssessmentStatusSchema = z.enum(["DRAFT", "PUBLISHED"]);

const assessmentFieldsShape = {
  criterionCode: assessmentCriterionCodeSchema,
  periodStart: dateOnly,
  periodEnd: dateOnly,
  content: z.string().trim().min(1, "Nhập nội dung nhận xét.").max(2000),
};

/** Creates a draft. Drafts are not shown as the official note until published. */
export const createTeacherAssessmentSchema = z
  .object(assessmentFieldsShape)
  .strict()
  .refine((value) => value.periodStart <= value.periodEnd, {
    message: "Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.",
    path: ["periodEnd"],
  });

/** Edits any field. Editing a published note needs a reason, which is stored with the replaced values. */
export const updateTeacherAssessmentSchema = z
  .object({
    criterionCode: assessmentCriterionCodeSchema.optional(),
    periodStart: dateOnly.optional(),
    periodEnd: dateOnly.optional(),
    content: assessmentFieldsShape.content.optional(),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export const teacherAssessmentSchema = z.object({
  assessmentId: z.uuid(),
  childId: z.uuid(),
  classId: z.uuid(),
  authorId: z.uuid(),
  authorName: z.string(),
  criterionCode: assessmentCriterionCodeSchema,
  periodStart: dateOnly,
  periodEnd: dateOnly,
  content: z.string(),
  status: teacherAssessmentStatusSchema,
  publishedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  revisionCount: z.number().int().min(0),
});
export const teacherAssessmentListSchema = z.array(teacherAssessmentSchema);

export const teacherAssessmentRevisionSchema = z.object({
  revisionNo: z.number().int().min(1),
  changedAt: z.iso.datetime(),
  changedByName: z.string(),
  reason: z.string().nullable(),
  previous: z.object({
    criterionCode: assessmentCriterionCodeSchema,
    periodStart: dateOnly,
    periodEnd: dateOnly,
    content: z.string(),
    status: teacherAssessmentStatusSchema,
  }),
});

export const teacherAssessmentDetailSchema = teacherAssessmentSchema.extend({
  revisions: z.array(teacherAssessmentRevisionSchema),
});

export type CreateTeacherAssessmentInput = z.infer<typeof createTeacherAssessmentSchema>;
export type UpdateTeacherAssessmentInput = z.infer<typeof updateTeacherAssessmentSchema>;
export type TeacherAssessment = z.infer<typeof teacherAssessmentSchema>;
export type TeacherAssessmentDetail = z.infer<typeof teacherAssessmentDetailSchema>;
