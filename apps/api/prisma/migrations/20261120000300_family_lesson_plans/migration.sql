BEGIN;

-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "ageGroupId" VARCHAR(20);

-- AlterTable
ALTER TABLE "ActivityAssignment" ADD COLUMN     "source" "AssignmentSource" NOT NULL DEFAULT 'TEACHER',
ALTER COLUMN "classId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "AiTokenUsage" ADD COLUMN     "durationMs" INTEGER;

-- AlterTable
ALTER TABLE "InteractionEvent" ALTER COLUMN "result" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Teacher" (
    "userId" UUID NOT NULL,
    "specialization" VARCHAR(200) NOT NULL DEFAULT '',

    CONSTRAINT "Teacher_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Guardian" (
    "userId" UUID NOT NULL,
    "relationship" "GuardianRelationship" NOT NULL,

    CONSTRAINT "Guardian_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "GuardianChild" (
    "guardianId" UUID NOT NULL,
    "childId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuardianChild_pkey" PRIMARY KEY ("guardianId","childId")
);

-- CreateTable
CREATE TABLE "EmailVerification" (
    "userId" UUID NOT NULL,
    "codeDigest" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerification_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "ClassInvite" (
    "inviteId" UUID NOT NULL,
    "classId" UUID NOT NULL,
    "codeDigest" CHAR(64) NOT NULL,
    "createdBy" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "maxUses" INTEGER NOT NULL,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassInvite_pkey" PRIMARY KEY ("inviteId")
);

-- CreateTable
CREATE TABLE "ClassJoinRequest" (
    "requestId" UUID NOT NULL,
    "inviteId" UUID NOT NULL,
    "classId" UUID NOT NULL,
    "childId" UUID NOT NULL,
    "guardianId" UUID NOT NULL,
    "status" "JoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "consentVersion" VARCHAR(40) NOT NULL,
    "consentScope" TEXT[],
    "consentedAt" TIMESTAMPTZ(3) NOT NULL,
    "requestedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMPTZ(3),
    "decidedBy" UUID,

    CONSTRAINT "ClassJoinRequest_pkey" PRIMARY KEY ("requestId")
);

-- CreateTable
CREATE TABLE "SharingConsent" (
    "consentId" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "enrollmentId" UUID NOT NULL,
    "childId" UUID NOT NULL,
    "guardianId" UUID NOT NULL,
    "classId" UUID NOT NULL,
    "version" VARCHAR(40) NOT NULL,
    "scope" TEXT[],
    "grantedAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "SharingConsent_pkey" PRIMARY KEY ("consentId")
);

-- CreateTable
CREATE TABLE "LessonPlan" (
    "lessonPlanId" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "topic" VARCHAR(200) NOT NULL DEFAULT '',
    "ageGroupId" VARCHAR(20),
    "skillCode" VARCHAR(20),
    "durationMinutes" INTEGER,
    "objectives" TEXT NOT NULL DEFAULT '',
    "preparation" TEXT NOT NULL DEFAULT '',
    "evaluation" TEXT NOT NULL DEFAULT '',
    "status" "LessonPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdBy" UUID NOT NULL,
    "updatedBy" UUID NOT NULL,
    "sourceLessonPlanId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LessonPlan_pkey" PRIMARY KEY ("lessonPlanId")
);

-- CreateTable
CREATE TABLE "LessonBlock" (
    "blockId" UUID NOT NULL,
    "lessonPlanId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "instruction" TEXT NOT NULL DEFAULT '',
    "durationMinutes" INTEGER,
    "versionId" UUID,

    CONSTRAINT "LessonBlock_pkey" PRIMARY KEY ("blockId")
);

-- CreateIndex
CREATE INDEX "GuardianChild_childId_idx" ON "GuardianChild"("childId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassInvite_codeDigest_key" ON "ClassInvite"("codeDigest");

-- CreateIndex
CREATE INDEX "ClassInvite_classId_createdAt_idx" ON "ClassInvite"("classId", "createdAt");

-- CreateIndex
CREATE INDEX "ClassJoinRequest_classId_status_idx" ON "ClassJoinRequest"("classId", "status");

-- CreateIndex
CREATE INDEX "ClassJoinRequest_guardianId_requestedAt_idx" ON "ClassJoinRequest"("guardianId", "requestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SharingConsent_requestId_key" ON "SharingConsent"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "SharingConsent_enrollmentId_key" ON "SharingConsent"("enrollmentId");

-- CreateIndex
CREATE INDEX "SharingConsent_childId_idx" ON "SharingConsent"("childId");

-- CreateIndex
CREATE INDEX "LessonPlan_createdBy_updatedAt_idx" ON "LessonPlan"("createdBy", "updatedAt");

-- CreateIndex
CREATE INDEX "LessonBlock_versionId_idx" ON "LessonBlock"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "LessonBlock_lessonPlanId_position_key" ON "LessonBlock"("lessonPlanId", "position");

-- CreateIndex
CREATE INDEX "ActivityAssignment_source_createdBy_idx" ON "ActivityAssignment"("source", "createdBy");

-- AddForeignKey
ALTER TABLE "Teacher" ADD CONSTRAINT "Teacher_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guardian" ADD CONSTRAINT "Guardian_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardianChild" ADD CONSTRAINT "GuardianChild_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "Guardian"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardianChild" ADD CONSTRAINT "GuardianChild_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("childId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailVerification" ADD CONSTRAINT "EmailVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_ageGroupId_fkey" FOREIGN KEY ("ageGroupId") REFERENCES "AgeGroup"("ageGroupId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassInvite" ADD CONSTRAINT "ClassInvite_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Classroom"("classId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassInvite" ADD CONSTRAINT "ClassInvite_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassJoinRequest" ADD CONSTRAINT "ClassJoinRequest_inviteId_fkey" FOREIGN KEY ("inviteId") REFERENCES "ClassInvite"("inviteId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassJoinRequest" ADD CONSTRAINT "ClassJoinRequest_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Classroom"("classId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassJoinRequest" ADD CONSTRAINT "ClassJoinRequest_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("childId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassJoinRequest" ADD CONSTRAINT "ClassJoinRequest_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "Guardian"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassJoinRequest" ADD CONSTRAINT "ClassJoinRequest_decidedBy_fkey" FOREIGN KEY ("decidedBy") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharingConsent" ADD CONSTRAINT "SharingConsent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ClassJoinRequest"("requestId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharingConsent" ADD CONSTRAINT "SharingConsent_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "ClassroomEnrollment"("enrollmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharingConsent" ADD CONSTRAINT "SharingConsent_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("childId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharingConsent" ADD CONSTRAINT "SharingConsent_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "Guardian"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharingConsent" ADD CONSTRAINT "SharingConsent_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Classroom"("classId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonPlan" ADD CONSTRAINT "LessonPlan_ageGroupId_fkey" FOREIGN KEY ("ageGroupId") REFERENCES "AgeGroup"("ageGroupId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonPlan" ADD CONSTRAINT "LessonPlan_skillCode_fkey" FOREIGN KEY ("skillCode") REFERENCES "Skill"("skillCode") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonPlan" ADD CONSTRAINT "LessonPlan_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonPlan" ADD CONSTRAINT "LessonPlan_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonPlan" ADD CONSTRAINT "LessonPlan_sourceLessonPlanId_fkey" FOREIGN KEY ("sourceLessonPlanId") REFERENCES "LessonPlan"("lessonPlanId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonBlock" ADD CONSTRAINT "LessonBlock_lessonPlanId_fkey" FOREIGN KEY ("lessonPlanId") REFERENCES "LessonPlan"("lessonPlanId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonBlock" ADD CONSTRAINT "LessonBlock_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ActivityVersion"("versionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A class assignment has a class; a family pick never does.
ALTER TABLE "ActivityAssignment" ADD CONSTRAINT "ActivityAssignment_source_check" CHECK (
  ("source" = 'TEACHER' AND "classId" IS NOT NULL) OR ("source" = 'GUARDIAN' AND "classId" IS NULL)
);
-- A hint request is the only event without a result.
ALTER TABLE "InteractionEvent" ADD CONSTRAINT "InteractionEvent_hint_result_check" CHECK (
  ("eventType" = 'REQUEST_HINT') = ("result" IS NULL)
);
ALTER TABLE "ClassInvite" ADD CONSTRAINT "ClassInvite_uses_check" CHECK ("maxUses" BETWEEN 1 AND 200 AND "useCount" BETWEEN 0 AND "maxUses");
-- At most one pending request per child and class (a resend must not create a duplicate, BR-20).
CREATE UNIQUE INDEX "ClassJoinRequest_pending_key" ON "ClassJoinRequest"("classId", "childId") WHERE "status" = 'PENDING';
ALTER TABLE "ClassJoinRequest" ADD CONSTRAINT "ClassJoinRequest_decision_check" CHECK (
  ("status" = 'PENDING' AND "decidedAt" IS NULL) OR ("status" <> 'PENDING' AND "decidedAt" IS NOT NULL)
);
ALTER TABLE "LessonBlock" ADD CONSTRAINT "LessonBlock_position_check" CHECK ("position" >= 0);
ALTER TABLE "LessonBlock" ADD CONSTRAINT "LessonBlock_duration_check" CHECK ("durationMinutes" IS NULL OR "durationMinutes" BETWEEN 1 AND 240);
ALTER TABLE "LessonPlan" ADD CONSTRAINT "LessonPlan_duration_check" CHECK ("durationMinutes" IS NULL OR "durationMinutes" BETWEEN 1 AND 480);

-- Profiles for existing accounts (data dictionary: Teacher / Guardian extend User).
INSERT INTO "Teacher" ("userId")
SELECT ur."userId" FROM "UserRole" ur JOIN "Role" r ON r."roleId" = ur."roleId" WHERE r."code" = 'ROLE_TEACHER'
ON CONFLICT ("userId") DO NOTHING;
INSERT INTO "Guardian" ("userId", "relationship")
SELECT ur."userId", 'OTHER' FROM "UserRole" ur JOIN "Role" r ON r."roleId" = ur."roleId" WHERE r."code" = 'ROLE_GUARDIAN'
ON CONFLICT ("userId") DO NOTHING;

INSERT INTO "Role" ("roleId", "code") VALUES (gen_random_uuid(), 'ROLE_GUARDIAN')
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "Permission" ("permissionId", "code") VALUES
  (gen_random_uuid(), 'MANAGE_LESSON_PLANS'),
  (gen_random_uuid(), 'MANAGE_CLASS_INVITES'),
  (gen_random_uuid(), 'MANAGE_FAMILY')
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."roleId", p."permissionId" FROM "Role" r JOIN "Permission" p ON
  (r."code" = 'ROLE_TEACHER' AND p."code" IN ('MANAGE_LESSON_PLANS', 'MANAGE_CLASS_INVITES')) OR
  (r."code" = 'ROLE_GUARDIAN' AND p."code" IN ('MANAGE_FAMILY', 'READ_GAMES', 'READ_OWN_ACCOUNT'))
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

COMMIT;
