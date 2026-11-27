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
  /** Sign-in is refused until this time after five wrong passwords (FR-1.1 AC-02); null when not locked. */
  lockedUntil: z.iso.datetime().nullable(),
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
  lockedUntil: z.iso.datetime().nullable(),
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
/** Server-side filters and paging for the admin guardian list (query string values). */
export const guardianFilterSchema = z.object({
  /** Matches the guardian's name or email, or a child's name. */
  q: z.string().trim().max(100).default(""),
  status: z.enum(["", "ACTIVE", "PENDING_VERIFICATION", "DISABLED"]).default(""),
  /** UNPLACED: some child without a class; NONE: no child profile yet. */
  children: z.enum(["", "UNPLACED", "NONE"]).default(""),
}).strict();
export const guardianQuerySchema = guardianFilterSchema.extend({
  sort: z.enum(["name", "createdAt"]).default("createdAt"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
}).strict();
export const guardianPageSchema = z.object({
  items: z.array(guardianAccountSchema),
  total: z.number().int(),
  counts: z.object({
    all: z.number().int(),
    active: z.number().int(),
    pending: z.number().int(),
    disabled: z.number().int(),
    children: z.number().int(),
    unplacedChildren: z.number().int(),
  }),
});
export const GUARDIAN_ID_LIMIT = 1000;
export const guardianPickSchema = z.object({ userId: z.uuid(), fullName: z.string(), status: accountStatusSchema });
export const guardianIdsSchema = z.object({ items: z.array(guardianPickSchema), truncated: z.boolean() });
export type GuardianPick = z.infer<typeof guardianPickSchema>;
export type GuardianFilter = z.infer<typeof guardianFilterSchema>;
export type GuardianQuery = z.infer<typeof guardianQuerySchema>;
export type GuardianPage = z.infer<typeof guardianPageSchema>;
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

// ---------- Bulk status and detail panels ----------

/** Deactivate or reactivate up to 100 accounts at once (passwords are never reset in bulk). */
export const bulkAccountStatusSchema = z
  .object({
    userIds: z.array(z.uuid()).min(1).max(100),
    status: staffAccountStatusSchema,
  })
  .strict()
  .refine((value) => new Set(value.userIds).size === value.userIds.length, "Tài khoản bị lặp.");
export const bulkSkipReasonSchema = z.enum(["NOT_FOUND", "PENDING_VERIFICATION", "UNCHANGED"]);
export const bulkAccountStatusResultSchema = z.object({
  updated: z.array(z.uuid()),
  skipped: z.array(z.object({ userId: z.uuid(), reason: bulkSkipReasonSchema })),
});

export const teacherAccountDetailSchema = teacherAccountSchema.extend({
  /** Devices signed in now (unrevoked, unexpired sessions). */
  activeSessions: z.number().int(),
  assignmentCount: z.number().int(),
  /** Games the teacher saved to the shared library. */
  gameCount: z.number().int(),
});

/** How a child's play reaches a class: consented join, enrolled by the school, a pending request, or home only. */
export const childSharingSchema = z.enum(["CONSENTED", "SCHOOL_ENROLLED", "PENDING_REQUEST", "HOME"]);
export const guardianAccountDetailSchema = guardianAccountSchema.extend({
  activeSessions: z.number().int(),
  children: z.array(
    z.object({
      childId: z.uuid(),
      fullName: z.string(),
      dob: z.iso.date(),
      classroom: z.object({ classId: z.uuid(), className: z.string() }).nullable(),
      sharing: childSharingSchema,
      consentGrantedAt: z.iso.datetime().nullable(),
      /** Class asked for in a request still waiting for the teacher. */
      pendingClassName: z.string().nullable(),
      lastPlayedAt: z.iso.datetime().nullable(),
    }),
  ),
});

export type BulkAccountStatusInput = z.infer<typeof bulkAccountStatusSchema>;
export type BulkAccountStatusResult = z.infer<typeof bulkAccountStatusResultSchema>;
export type TeacherAccountDetail = z.infer<typeof teacherAccountDetailSchema>;
export type GuardianAccountDetail = z.infer<typeof guardianAccountDetailSchema>;
export type ChildSharing = z.infer<typeof childSharingSchema>;
