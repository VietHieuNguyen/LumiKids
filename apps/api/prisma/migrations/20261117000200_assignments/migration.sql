BEGIN;

-- CreateTable
CREATE TABLE "ClassGroup" (
    "groupId" UUID NOT NULL,
    "classId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ClassGroup_pkey" PRIMARY KEY ("groupId")
);

-- CreateTable
CREATE TABLE "ClassGroupMember" (
    "groupId" UUID NOT NULL,
    "childId" UUID NOT NULL,
    "addedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassGroupMember_pkey" PRIMARY KEY ("groupId","childId")
);

-- CreateTable
CREATE TABLE "ActivityAssignment" (
    "assignmentId" UUID NOT NULL,
    "classId" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "note" VARCHAR(1000) NOT NULL DEFAULT '',
    "createdBy" UUID NOT NULL,
    "opensAt" TIMESTAMPTZ(3) NOT NULL,
    "dueAt" TIMESTAMPTZ(3),
    "targetType" "AssignmentTargetType" NOT NULL,
    "targetLabel" VARCHAR(120) NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ActivityAssignment_pkey" PRIMARY KEY ("assignmentId")
);

-- CreateTable
CREATE TABLE "ActivityAssignmentItem" (
    "assignmentId" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "ActivityAssignmentItem_pkey" PRIMARY KEY ("assignmentId","versionId")
);

-- CreateTable
CREATE TABLE "ActivityRecipient" (
    "recipientId" UUID NOT NULL,
    "assignmentId" UUID NOT NULL,
    "childId" UUID NOT NULL,
    "extendedUntil" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityRecipient_pkey" PRIMARY KEY ("recipientId")
);

-- CreateTable
CREATE TABLE "ReplayRequest" (
    "requestId" UUID NOT NULL,
    "recipientId" UUID NOT NULL,
    "status" "ReplayRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMPTZ(3),
    "decidedBy" UUID,
    "grantedUntil" TIMESTAMPTZ(3),

    CONSTRAINT "ReplayRequest_pkey" PRIMARY KEY ("requestId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClassGroup_classId_name_key" ON "ClassGroup"("classId", "name");

-- CreateIndex
CREATE INDEX "ClassGroupMember_childId_idx" ON "ClassGroupMember"("childId");

-- CreateIndex
CREATE INDEX "ActivityAssignment_classId_opensAt_idx" ON "ActivityAssignment"("classId", "opensAt");

-- CreateIndex
CREATE INDEX "ActivityAssignmentItem_versionId_idx" ON "ActivityAssignmentItem"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityAssignmentItem_assignmentId_position_key" ON "ActivityAssignmentItem"("assignmentId", "position");

-- CreateIndex
CREATE INDEX "ActivityRecipient_childId_idx" ON "ActivityRecipient"("childId");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityRecipient_assignmentId_childId_key" ON "ActivityRecipient"("assignmentId", "childId");

-- CreateIndex
CREATE INDEX "ReplayRequest_recipientId_status_idx" ON "ReplayRequest"("recipientId", "status");

-- AddForeignKey
ALTER TABLE "ClassGroup" ADD CONSTRAINT "ClassGroup_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Classroom"("classId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassGroup" ADD CONSTRAINT "ClassGroup_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassGroupMember" ADD CONSTRAINT "ClassGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ClassGroup"("groupId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassGroupMember" ADD CONSTRAINT "ClassGroupMember_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("childId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityAssignment" ADD CONSTRAINT "ActivityAssignment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Classroom"("classId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityAssignment" ADD CONSTRAINT "ActivityAssignment_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityAssignmentItem" ADD CONSTRAINT "ActivityAssignmentItem_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ActivityAssignment"("assignmentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityAssignmentItem" ADD CONSTRAINT "ActivityAssignmentItem_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ActivityVersion"("versionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityRecipient" ADD CONSTRAINT "ActivityRecipient_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ActivityAssignment"("assignmentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityRecipient" ADD CONSTRAINT "ActivityRecipient_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("childId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplayRequest" ADD CONSTRAINT "ReplayRequest_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "ActivityRecipient"("recipientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplayRequest" ADD CONSTRAINT "ReplayRequest_decidedBy_fkey" FOREIGN KEY ("decidedBy") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- At most one pending replay request per recipient.
CREATE UNIQUE INDEX "ReplayRequest_recipientId_pending_key" ON "ReplayRequest"("recipientId") WHERE "status" = 'PENDING';

ALTER TABLE "ActivityAssignment" ADD CONSTRAINT "ActivityAssignment_period_check" CHECK ("dueAt" IS NULL OR "dueAt" > "opensAt");
ALTER TABLE "ActivityAssignmentItem" ADD CONSTRAINT "ActivityAssignmentItem_position_check" CHECK ("position" >= 0);
ALTER TABLE "ReplayRequest" ADD CONSTRAINT "ReplayRequest_decision_check" CHECK (
  ("status" = 'PENDING' AND "decidedAt" IS NULL AND "grantedUntil" IS NULL) OR
  ("status" = 'APPROVED' AND "decidedAt" IS NOT NULL AND "grantedUntil" IS NOT NULL) OR
  ("status" = 'REJECTED' AND "decidedAt" IS NOT NULL AND "grantedUntil" IS NULL)
);

INSERT INTO "Permission" ("permissionId", "code")
VALUES (gen_random_uuid(), 'ASSIGN_ACTIVITIES')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."roleId", p."permissionId" FROM "Role" r JOIN "Permission" p ON
  r."code" = 'ROLE_TEACHER' AND p."code" = 'ASSIGN_ACTIVITIES'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

COMMIT;
