-- FR-1.7 AC-02 privacy: who created a child decides whether school staff may see it.
CREATE TYPE "ChildOrigin" AS ENUM ('SCHOOL', 'FAMILY');

ALTER TABLE "Child" ADD COLUMN "origin" "ChildOrigin" NOT NULL DEFAULT 'SCHOOL';

-- Existing guardian-created profiles that never joined a class are home profiles.
UPDATE "Child" c
SET "origin" = 'FAMILY'
WHERE EXISTS (SELECT 1 FROM "GuardianChild" g WHERE g."childId" = c."childId")
  AND NOT EXISTS (SELECT 1 FROM "ClassroomEnrollment" e WHERE e."childId" = c."childId");

-- Time-limited support access granted by a guardian.
CREATE TABLE "SupportGrant" (
    "grantId" UUID NOT NULL,
    "childId" UUID NOT NULL,
    "guardianId" UUID NOT NULL,
    "grantedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    CONSTRAINT "SupportGrant_pkey" PRIMARY KEY ("grantId"),
    CONSTRAINT "SupportGrant_expiry_check" CHECK ("expiresAt" > "grantedAt")
);

CREATE INDEX "SupportGrant_childId_expiresAt_idx" ON "SupportGrant"("childId", "expiresAt");

ALTER TABLE "SupportGrant" ADD CONSTRAINT "SupportGrant_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("childId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportGrant" ADD CONSTRAINT "SupportGrant_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "Guardian"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Append-only audit trail.
CREATE TABLE "AuditLog" (
    "auditId" UUID NOT NULL,
    "actorUserId" UUID NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "targetType" VARCHAR(40) NOT NULL,
    "targetId" VARCHAR(64) NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("auditId")
);

CREATE INDEX "AuditLog_targetType_targetId_createdAt_idx" ON "AuditLog"("targetType", "targetId", "createdAt");
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");
