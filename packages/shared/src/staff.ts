import { z } from "zod";
import { guardianRelationshipSchema } from "./family.js";

/** Staff (adult) accounts managed by the admin. Teachers only for now; admins are created by seed. */
export const accountStatusSchema = z.enum(["ACTIVE", "DISABLED", "PENDING_VERIFICATION"]);
/** Statuses an admin may set on a staff account (verification is only for self-registered guardians). */
export const staffAccountStatusSchema = z.enum(["ACTIVE", "DISABLED"]);

const fullName = z.string().trim().min(1).max(120);
const phone = z.string().trim().max(20);

export const createTeacherAccountSchema = z
  .object({
    fullName,
    email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
    phone: phone.default(""),
    specialization: z.string().trim().max(200).default(""),
  })
  .strict();
export const updateTeacherAccountSchema = z
  .object({
    fullName: fullName.optional(),
    phone: phone.optional(),
    specialization: z.string().trim().max(200).optional(),
    status: staffAccountStatusSchema.optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "Không có gì để cập nhật.",
  });

export const teacherAccountSchema = z.object({
  userId: z.uuid(),
  fullName: z.string(),
  email: z.string(),
  phone: z.string(),
  /** Chuyên môn (Teacher profile). */
  specialization: z.string(),
  status: accountStatusSchema,
  createdAt: z.iso.datetime(),
  /** Last time the teacher signed in (newest auth session), null if never. */
  lastLoginAt: z.iso.datetime().nullable(),
  classes: z.array(
    z.object({
      classId: z.uuid(),
      className: z.string(),
      schoolYearName: z.string(),
      status: z.enum(["ACTIVE", "ARCHIVED"]),
    }),
  ),
});
export const teacherAccountListSchema = z.array(teacherAccountSchema);

/** Returned once when an account is created or its password is reset; never stored in clear. */
export const issuedPasswordSchema = z.object({
  account: teacherAccountSchema,
  temporaryPassword: z.string(),
});

export const changeOwnPasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(256),
    newPassword: z.string().min(10).max(128),
  })
  .strict()
  .refine((value) => value.newPassword !== value.currentPassword, {
    message: "Mật khẩu mới phải khác mật khẩu cũ.",
    path: ["newPassword"],
  });

export type AccountStatus = z.infer<typeof accountStatusSchema>;
export type CreateTeacherAccountInput = z.input<typeof createTeacherAccountSchema>;
export type UpdateTeacherAccountInput = z.infer<typeof updateTeacherAccountSchema>;
export type TeacherAccount = z.infer<typeof teacherAccountSchema>;
export type IssuedPassword = z.infer<typeof issuedPasswordSchema>;
export type ChangeOwnPasswordInput = z.infer<typeof changeOwnPasswordSchema>;

/** Guardian (family) accounts as the admin sees them. Guardians register themselves; the admin only locks, unlocks or resets. */
export const guardianAccountSchema = z.object({
  userId: z.uuid(),
  fullName: z.string(),
  email: z.string(),
  phone: z.string(),
  relationship: guardianRelationshipSchema,
  status: accountStatusSchema,
  createdAt: z.iso.datetime(),
  lastLoginAt: z.iso.datetime().nullable(),
  children: z.array(
    z.object({
      childId: z.uuid(),
      fullName: z.string(),
      dob: z.iso.date(),
      /** Class the child is in now; null when the family uses LumiKids on its own. */
      classroom: z.object({ classId: z.uuid(), className: z.string() }).nullable(),
    }),
  ),
});
export const guardianAccountListSchema = z.array(guardianAccountSchema);
/** Lock or unlock. An account still waiting for email verification cannot be changed this way. */
export const updateGuardianAccountSchema = z.object({ status: staffAccountStatusSchema }).strict();
export const issuedGuardianPasswordSchema = z.object({
  account: guardianAccountSchema,
  temporaryPassword: z.string(),
});

export type GuardianAccount = z.infer<typeof guardianAccountSchema>;
export type UpdateGuardianAccountInput = z.infer<typeof updateGuardianAccountSchema>;
export type IssuedGuardianPassword = z.infer<typeof issuedGuardianPasswordSchema>;

/** One's own adult account (any role). Email is the sign-in name and cannot change. */
export const accountProfileSchema = z.object({
  userId: z.uuid(),
  fullName: z.string(),
  email: z.string(),
  phone: z.string(),
  roles: z.array(z.string()),
  createdAt: z.iso.datetime(),
  /** The sign-in before the current one, so a stranger's use is noticed; null on the first. */
  previousLoginAt: z.iso.datetime().nullable(),
  /** Devices or browsers still signed in. */
  activeSessions: z.number().int().nonnegative(),
  teacher: z
    .object({
      specialization: z.string(),
      classes: z.array(
        z.object({
          classId: z.uuid(),
          className: z.string(),
          schoolYearName: z.string(),
          ageGroupName: z.string(),
          childCount: z.number().int().nonnegative(),
        }),
      ),
    })
    .nullable(),
  guardian: z
    .object({
      relationship: guardianRelationshipSchema,
      children: z.array(
        z.object({
          childId: z.uuid(),
          fullName: z.string(),
          dob: z.iso.date(),
          className: z.string().nullable(),
        }),
      ),
    })
    .nullable(),
});
export const updateAccountProfileSchema = z
  .object({
    fullName: fullName.optional(),
    phone: phone.optional(),
    /** Teachers only. */
    specialization: z.string().trim().max(200).optional(),
    /** Guardians only. */
    relationship: guardianRelationshipSchema.optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "Không có gì để cập nhật.",
  });

export type AccountProfile = z.infer<typeof accountProfileSchema>;
export type UpdateAccountProfileInput = z.infer<typeof updateAccountProfileSchema>;
