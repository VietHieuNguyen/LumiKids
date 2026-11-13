-- Commit enum values before the role/permission grants in the next migration.
ALTER TYPE "RoleCode" ADD VALUE 'ROLE_CHILD';
ALTER TYPE "PermissionCode" ADD VALUE 'PLAY_GAMES';
ALTER TYPE "PermissionCode" ADD VALUE 'SUBMIT_OWN_INTERACTIONS';
ALTER TYPE "PermissionCode" ADD VALUE 'READ_OWN_PLAY_SESSIONS';
