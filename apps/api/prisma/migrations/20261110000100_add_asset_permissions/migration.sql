-- Prepared offline. Apply only after operator review/approval.
-- Commit enum values before using them in the following migration.
ALTER TYPE "PermissionCode" ADD VALUE 'READ_GAME_ASSETS';
ALTER TYPE "PermissionCode" ADD VALUE 'MANAGE_GAME_ASSETS';
