-- Commit enum values before the tables and permission grants in the next migration.
CREATE TYPE "ChildStatus" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "ClassroomStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
ALTER TYPE "PermissionCode" ADD VALUE 'MANAGE_CLASSROOMS';
ALTER TYPE "PermissionCode" ADD VALUE 'READ_OWN_CLASSROOMS';
ALTER TYPE "PermissionCode" ADD VALUE 'RESET_CHILD_LOGIN_CODES';
