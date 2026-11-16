BEGIN;
-- Classroom phase 1A: a child is no longer a User. Existing Child rows and their PlaySessions are kept;
-- only the link to the old ROLE_CHILD user account is dropped (that User row is left untouched).

-- DropForeignKey
ALTER TABLE "Child" DROP CONSTRAINT "Child_userId_fkey";

-- DropIndex
DROP INDEX "Child_userId_key";

-- AlterTable
ALTER TABLE "Child" DROP COLUMN "userId",
ADD COLUMN     "loginCodeDigest" CHAR(64),
ADD COLUMN     "loginCodeIssuedAt" TIMESTAMPTZ(3),
ADD COLUMN     "status" "ChildStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "SchoolYear" (
    "schoolYearId" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolYear_pkey" PRIMARY KEY ("schoolYearId")
);

-- CreateTable
CREATE TABLE "AgeGroup" (
    "ageGroupId" VARCHAR(20) NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "minAge" INTEGER NOT NULL,
    "maxAge" INTEGER NOT NULL,
    "displayOrder" INTEGER NOT NULL,

    CONSTRAINT "AgeGroup_pkey" PRIMARY KEY ("ageGroupId")
);

-- CreateTable
CREATE TABLE "Classroom" (
    "classId" UUID NOT NULL,
    "className" VARCHAR(100) NOT NULL,
    "schoolYearId" UUID NOT NULL,
    "ageGroupId" VARCHAR(20) NOT NULL,
    "status" "ClassroomStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Classroom_pkey" PRIMARY KEY ("classId")
);

-- CreateTable
CREATE TABLE "ClassroomTeacher" (
    "classId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "addedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassroomTeacher_pkey" PRIMARY KEY ("classId","userId")
);

-- CreateTable
CREATE TABLE "ClassroomEnrollment" (
    "enrollmentId" UUID NOT NULL,
    "classId" UUID NOT NULL,
    "childId" UUID NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ClassroomEnrollment_pkey" PRIMARY KEY ("enrollmentId")
);

-- CreateTable
CREATE TABLE "ChildAuthSession" (
    "sessionId" UUID NOT NULL,
    "childId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ChildAuthSession_pkey" PRIMARY KEY ("sessionId")
);

-- CreateTable
CREATE TABLE "ChildRefreshToken" (
    "tokenId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "verifier" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ChildRefreshToken_pkey" PRIMARY KEY ("tokenId")
);

-- CreateIndex
CREATE UNIQUE INDEX "SchoolYear_name_key" ON "SchoolYear"("name");

-- CreateIndex
CREATE UNIQUE INDEX "AgeGroup_name_key" ON "AgeGroup"("name");

-- CreateIndex
CREATE INDEX "Classroom_status_idx" ON "Classroom"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Classroom_schoolYearId_className_key" ON "Classroom"("schoolYearId", "className");

-- CreateIndex
CREATE INDEX "ClassroomTeacher_userId_idx" ON "ClassroomTeacher"("userId");

-- CreateIndex
CREATE INDEX "ClassroomEnrollment_childId_startedAt_idx" ON "ClassroomEnrollment"("childId", "startedAt");

-- CreateIndex
CREATE INDEX "ClassroomEnrollment_classId_endedAt_idx" ON "ClassroomEnrollment"("classId", "endedAt");

-- CreateIndex
CREATE INDEX "ChildAuthSession_childId_idx" ON "ChildAuthSession"("childId");

-- CreateIndex
CREATE INDEX "ChildAuthSession_expiresAt_idx" ON "ChildAuthSession"("expiresAt");

-- CreateIndex
CREATE INDEX "ChildRefreshToken_sessionId_idx" ON "ChildRefreshToken"("sessionId");

-- CreateIndex
CREATE INDEX "ChildRefreshToken_expiresAt_idx" ON "ChildRefreshToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Child_loginCodeDigest_key" ON "Child"("loginCodeDigest");

-- AddForeignKey
ALTER TABLE "Classroom" ADD CONSTRAINT "Classroom_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("schoolYearId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Classroom" ADD CONSTRAINT "Classroom_ageGroupId_fkey" FOREIGN KEY ("ageGroupId") REFERENCES "AgeGroup"("ageGroupId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassroomTeacher" ADD CONSTRAINT "ClassroomTeacher_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Classroom"("classId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassroomTeacher" ADD CONSTRAINT "ClassroomTeacher_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassroomEnrollment" ADD CONSTRAINT "ClassroomEnrollment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Classroom"("classId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassroomEnrollment" ADD CONSTRAINT "ClassroomEnrollment_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("childId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChildAuthSession" ADD CONSTRAINT "ChildAuthSession_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("childId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChildRefreshToken" ADD CONSTRAINT "ChildRefreshToken_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChildAuthSession"("sessionId") ON DELETE CASCADE ON UPDATE CASCADE;

-- A child has at most one current (open) enrollment.
CREATE UNIQUE INDEX "ClassroomEnrollment_childId_open_key" ON "ClassroomEnrollment"("childId") WHERE "endedAt" IS NULL;

ALTER TABLE "ClassroomEnrollment" ADD CONSTRAINT "ClassroomEnrollment_period_check" CHECK ("endedAt" IS NULL OR "endedAt" > "startedAt");
ALTER TABLE "SchoolYear" ADD CONSTRAINT "SchoolYear_period_check" CHECK ("endDate" > "startDate");
ALTER TABLE "AgeGroup" ADD CONSTRAINT "AgeGroup_age_check" CHECK ("minAge" >= 0 AND "maxAge" > "minAge");

-- Age-group catalogue (Vietnamese preschool levels).
INSERT INTO "AgeGroup" ("ageGroupId", "name", "minAge", "maxAge", "displayOrder") VALUES
  ('AGE_3_4', 'Mầm (3–4 tuổi)', 3, 4, 1),
  ('AGE_4_5', 'Chồi (4–5 tuổi)', 4, 5, 2),
  ('AGE_5_6', 'Lá (5–6 tuổi)', 5, 6, 3)
ON CONFLICT ("ageGroupId") DO NOTHING;

INSERT INTO "Permission" ("permissionId", "code")
VALUES (gen_random_uuid(), 'MANAGE_CLASSROOMS'),
       (gen_random_uuid(), 'READ_OWN_CLASSROOMS'),
       (gen_random_uuid(), 'RESET_CHILD_LOGIN_CODES')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."roleId", p."permissionId" FROM "Role" r JOIN "Permission" p ON
  (r."code" = 'ROLE_ADMIN' AND p."code" = 'MANAGE_CLASSROOMS') OR
  (r."code" = 'ROLE_TEACHER' AND p."code" IN ('READ_OWN_CLASSROOMS', 'RESET_CHILD_LOGIN_CODES'))
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

COMMIT;
