import { z } from "zod";
import { genderSchema, childStatusSchema } from "./classroom.js";

const dateOnly = z.iso.date();
const today = () => new Date().toISOString().slice(0, 10);

// ---------- Registration (guardian self sign-up, FR-1.6) ----------

export const guardianRelationshipSchema = z.enum(["MOTHER", "FATHER", "GRANDPARENT", "OTHER"]);
export const registerGuardianSchema = z
  .object({
    fullName: z.string().trim().min(1).max(120),
    email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
    phone: z.string().trim().max(20).default(""),
    relationship: guardianRelationshipSchema,
    password: z.string().min(10).max(128),
  })
  .strict();
export const verifyEmailSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
    code: z.string().trim().regex(/^\d{6}$/),
  })
  .strict();
export const resendVerificationSchema = z
  .object({ email: z.string().trim().toLowerCase().pipe(z.email().max(254)) })
  .strict();
/** Same answer whether or not the email exists, so registration cannot be used to probe accounts. */
export const registrationAcceptedSchema = z.object({
  email: z.string(),
  /** Minutes the emailed code stays valid. */
  expiresInMinutes: z.number().int(),
});

// ---------- Guardian's children ----------

const childProfile = {
  fullName: z.string().trim().min(1).max(120),
  dob: dateOnly.refine((value) => value <= today(), "Ngày sinh không hợp lệ."),
  gender: genderSchema,
};
export const createFamilyChildSchema = z.object(childProfile).strict();
export const updateFamilyChildSchema = z
  .object({
    fullName: childProfile.fullName.optional(),
    dob: childProfile.dob.optional(),
    gender: genderSchema.optional(),
  })
  .strict();

export const joinRequestStatusSchema = z.enum(["PENDING", "APPROVED", "REJECTED"]);
export const familyChildClassSchema = z.object({
  classId: z.uuid(),
  className: z.string(),
  schoolYearName: z.string(),
  ageGroupName: z.string(),
  /** True when the child joined through the guardian's request: the guardian may leave the class. */
  viaGuardianConsent: z.boolean(),
  since: z.iso.datetime(),
});
export const familyJoinRequestSchema = z.object({
  requestId: z.uuid(),
  childId: z.uuid(),
  className: z.string(),
  schoolYearName: z.string(),
  status: joinRequestStatusSchema,
  requestedAt: z.iso.datetime(),
  decidedAt: z.iso.datetime().nullable(),
});
export const familyChildSchema = z.object({
  childId: z.uuid(),
  fullName: z.string(),
  dob: dateOnly,
  gender: genderSchema,
  status: childStatusSchema,
  loginCodeIssuedAt: z.iso.datetime().nullable(),
  currentClass: familyChildClassSchema.nullable(),
  joinRequests: z.array(familyJoinRequestSchema),
});
export const familyChildListSchema = z.array(familyChildSchema);

// ---------- Family picks (guardian chooses games for a child without a class) ----------

export const createFamilyActivitySchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    versionIds: z
      .array(z.uuid())
      .min(1)
      .max(10)
      .refine((values) => new Set(values).size === values.length, "Duplicate games"),
    dueAt: z.iso.datetime().nullable().default(null),
  })
  .strict();
export const familyActivitySchema = z.object({
  assignmentId: z.uuid(),
  title: z.string(),
  opensAt: z.iso.datetime(),
  dueAt: z.iso.datetime().nullable(),
  state: z.enum(["OPEN", "CLOSED", "CANCELLED"]),
  games: z.array(
    z.object({ versionId: z.uuid(), name: z.string(), completed: z.boolean(), available: z.boolean() }),
  ),
});
export const familyActivityListSchema = z.array(familyActivitySchema);

// ---------- Class invitations (FR-1.8) and consent (BR-15) ----------

/** Current consent text version; bump it when the wording or scope below changes. */
export const SHARING_CONSENT_VERSION = "consent-v1";
export const sharingConsentScopeSchema = z.enum(["PLAY_RESULTS", "ASSESSMENT", "PROFILE"]);
export const SHARING_CONSENT_SCOPE = ["PROFILE", "PLAY_RESULTS", "ASSESSMENT"] as const;

export const createClassInviteSchema = z
  .object({
    /** Days until the link expires (default 7). */
    expiresInDays: z.number().int().min(1).max(30).default(7),
    maxUses: z.number().int().min(1).max(200).default(30),
  })
  .strict();
export const classInviteSchema = z.object({
  inviteId: z.uuid(),
  createdByName: z.string(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  maxUses: z.number().int(),
  useCount: z.number().int(),
  state: z.enum(["ACTIVE", "EXPIRED", "REVOKED", "USED_UP"]),
});
export const classInviteListSchema = z.array(classInviteSchema);
/** Returned once: the code is never readable again (only its HMAC is stored). */
export const issuedClassInviteSchema = z.object({ invite: classInviteSchema, code: z.string() });

/** What a guardian sees before asking to join: enough to recognise the class, nothing about its children. */
export const invitePreviewSchema = z.object({
  className: z.string(),
  schoolYearName: z.string(),
  ageGroupName: z.string(),
  teacherNames: z.array(z.string()),
  expiresAt: z.iso.datetime(),
  consentVersion: z.string(),
  consentScope: z.array(sharingConsentScopeSchema),
});
export const inviteCodeSchema = z.object({ code: z.string().trim().min(6).max(40) }).strict();
export const createJoinRequestSchema = z
  .object({
    code: z.string().trim().min(6).max(40),
    childId: z.uuid(),
    consentVersion: z.literal(SHARING_CONSENT_VERSION),
    consentAccepted: z.literal(true),
  })
  .strict();
export const classJoinRequestSchema = z.object({
  requestId: z.uuid(),
  childId: z.uuid(),
  childName: z.string(),
  dob: dateOnly,
  gender: genderSchema,
  guardianName: z.string(),
  guardianEmail: z.string(),
  relationship: guardianRelationshipSchema,
  status: joinRequestStatusSchema,
  consentVersion: z.string(),
  requestedAt: z.iso.datetime(),
  decidedAt: z.iso.datetime().nullable(),
  /** False when the child is outside the class age group today (the teacher may still approve). */
  ageMatches: z.boolean(),
});
export const classJoinRequestListSchema = z.array(classJoinRequestSchema);
export const decideJoinRequestSchema = z.object({ approve: z.boolean() }).strict();

export type GuardianRelationship = z.infer<typeof guardianRelationshipSchema>;
export type RegisterGuardianInput = z.input<typeof registerGuardianSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type RegistrationAccepted = z.infer<typeof registrationAcceptedSchema>;
export type CreateFamilyChildInput = z.infer<typeof createFamilyChildSchema>;
export type UpdateFamilyChildInput = z.infer<typeof updateFamilyChildSchema>;
export type FamilyChild = z.infer<typeof familyChildSchema>;
export type FamilyChildClass = z.infer<typeof familyChildClassSchema>;
export type FamilyJoinRequest = z.infer<typeof familyJoinRequestSchema>;
export type CreateFamilyActivityInput = z.input<typeof createFamilyActivitySchema>;
export type FamilyActivity = z.infer<typeof familyActivitySchema>;
export type CreateClassInviteInput = z.input<typeof createClassInviteSchema>;
export type ClassInvite = z.infer<typeof classInviteSchema>;
export type IssuedClassInvite = z.infer<typeof issuedClassInviteSchema>;
export type InvitePreview = z.infer<typeof invitePreviewSchema>;
export type CreateJoinRequestInput = z.infer<typeof createJoinRequestSchema>;
export type ClassJoinRequest = z.infer<typeof classJoinRequestSchema>;
export type JoinRequestStatus = z.infer<typeof joinRequestStatusSchema>;
