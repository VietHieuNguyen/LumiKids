-- Commit enum values before the tables, constraints and permission grants in the next migration.
CREATE TYPE "GuardianRelationship" AS ENUM ('MOTHER', 'FATHER', 'GRANDPARENT', 'OTHER');
CREATE TYPE "AssignmentSource" AS ENUM ('TEACHER', 'GUARDIAN');
CREATE TYPE "JoinRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "LessonPlanStatus" AS ENUM ('DRAFT', 'COMPLETE');
ALTER TYPE "AccountStatus" ADD VALUE 'PENDING_VERIFICATION';
ALTER TYPE "InteractionEventType" ADD VALUE 'REQUEST_HINT';
ALTER TYPE "PermissionCode" ADD VALUE 'MANAGE_LESSON_PLANS';
ALTER TYPE "PermissionCode" ADD VALUE 'MANAGE_CLASS_INVITES';
ALTER TYPE "PermissionCode" ADD VALUE 'MANAGE_FAMILY';
