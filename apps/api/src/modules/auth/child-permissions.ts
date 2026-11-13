import type { PermissionCode } from '../../generated/prisma/enums.js';

/** Learner permissions only. Teacher library permissions expose authoring data. */
export const childPermissions = [
  'READ_OWN_ACCOUNT',
  'PLAY_GAMES',
  'SUBMIT_OWN_INTERACTIONS',
  'READ_OWN_PLAY_SESSIONS',
] as const satisfies readonly PermissionCode[];
