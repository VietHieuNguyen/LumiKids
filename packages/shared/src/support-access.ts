import { z } from "zod";

/**
 * Support access (privacy): a guardian lets support staff see one home child for a short, fixed time.
 * Nothing is shared by default; the grant ends at expiresAt or when the guardian revokes it.
 */
export const SUPPORT_GRANT_MAX_HOURS = 72;

export const createSupportGrantSchema = z
  .object({ hours: z.number().int().min(1).max(SUPPORT_GRANT_MAX_HOURS) })
  .strict();

export const supportGrantSchema = z.object({
  grantId: z.uuid(),
  childId: z.uuid(),
  grantedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  revokedAt: z.iso.datetime().nullable(),
  active: z.boolean(),
});
export const supportGrantListSchema = z.array(supportGrantSchema);

export const supportChildViewSchema = z.object({
  child: z.object({
    childId: z.uuid(),
    fullName: z.string(),
    dob: z.iso.date(),
    gender: z.string(),
    status: z.string(),
  }),
  grant: z.object({ grantId: z.uuid(), expiresAt: z.iso.datetime() }),
  sessions: z.array(
    z.object({
      sessionId: z.uuid(),
      startedAt: z.iso.datetime(),
      endedAt: z.iso.datetime().nullable(),
      status: z.string(),
      context: z.string().nullable(),
      eventCount: z.number().int(),
    }),
  ),
});

export type CreateSupportGrantInput = z.infer<typeof createSupportGrantSchema>;
export type SupportGrant = z.infer<typeof supportGrantSchema>;
export type SupportChildView = z.infer<typeof supportChildViewSchema>;
