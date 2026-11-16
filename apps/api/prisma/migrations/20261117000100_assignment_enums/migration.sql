-- Commit enum values before the tables and permission grants in the next migration.
CREATE TYPE "AssignmentTargetType" AS ENUM ('CLASS', 'GROUP', 'CHILDREN');
CREATE TYPE "AssignmentStatus" AS ENUM ('ACTIVE', 'CANCELLED');
CREATE TYPE "ReplayRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
ALTER TYPE "PermissionCode" ADD VALUE 'ASSIGN_ACTIVITIES';
