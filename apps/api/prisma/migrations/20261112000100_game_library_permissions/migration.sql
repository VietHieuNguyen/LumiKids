-- Commit new enum values before grants in the following migration.
ALTER TYPE "PermissionCode" ADD VALUE 'READ_GAMES';
ALTER TYPE "PermissionCode" ADD VALUE 'SAVE_GAMES';
ALTER TYPE "PermissionCode" ADD VALUE 'MANAGE_ALL_GAMES';
