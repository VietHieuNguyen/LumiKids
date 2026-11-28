import { z } from 'zod';

/** Admin locks a child's sign-in (never the profile). A reason is required and every lock is kept. */
export const childLoginLockRequestSchema = z
  .object({ reason: z.string().trim().min(3).max(500) })
  .strict();

export const childLoginLockStateSchema = z.object({
  childId: z.uuid(),
  loginLocked: z.boolean(),
  reason: z.string().nullable(),
  lockedAt: z.iso.datetime().nullable(),
});

/** Active locks on children currently in the class; shown to the class teacher. */
export const classLoginLockListSchema = z.array(
  z.object({
    lockId: z.uuid(),
    childId: z.uuid(),
    childName: z.string(),
    reason: z.string(),
    lockedAt: z.iso.datetime(),
    lockedByName: z.string(),
  }),
);

export type ChildLoginLockRequest = z.infer<typeof childLoginLockRequestSchema>;
export type ClassLoginLock = z.infer<typeof classLoginLockListSchema>[number];
