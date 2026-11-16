import type { PermissionCode } from '../../generated/prisma/enums.js';

/**
 * Grants of the legacy ROLE_CHILD role (kept for the seeds; a child no longer signs in as a User).
 * Teacher library permissions expose authoring data.
 */
export const childPermissions = [
  'READ_OWN_ACCOUNT',
  'PLAY_GAMES',
  'SUBMIT_OWN_INTERACTIONS',
  'READ_OWN_PLAY_SESSIONS',
] as const satisfies readonly PermissionCode[];

/** What a child signed in with a login code may do. Fixed in code: children have no roles. */
export const childPrincipalPermissions = [
  'PLAY_GAMES',
  'SUBMIT_OWN_INTERACTIONS',
  'READ_OWN_PLAY_SESSIONS',
] as const satisfies readonly PermissionCode[];
