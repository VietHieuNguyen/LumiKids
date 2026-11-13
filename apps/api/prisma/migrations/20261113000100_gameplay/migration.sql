BEGIN;
-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "PlaySessionStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "InteractionEventType" AS ENUM ('SELECT_CHOICE', 'MATCH_DROP', 'CLASSIFY_DROP');

-- CreateEnum
CREATE TYPE "InteractionResult" AS ENUM ('CORRECT', 'INCORRECT');

-- CreateTable
CREATE TABLE "Child" (
    "childId" UUID NOT NULL,
    "fullName" VARCHAR(200) NOT NULL,
    "dob" DATE NOT NULL,
    "gender" "Gender" NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Child_pkey" PRIMARY KEY ("childId")
);

-- CreateTable
CREATE TABLE "PlaySession" (
    "sessionId" UUID NOT NULL,
    "childId" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "status" "PlaySessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startRequestId" UUID NOT NULL,
    "eventCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMPTZ(3),
    "lastEventAt" TIMESTAMPTZ(3),

    CONSTRAINT "PlaySession_pkey" PRIMARY KEY ("sessionId")
);

-- CreateTable
CREATE TABLE "InteractionEvent" (
    "eventId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "eventType" "InteractionEventType" NOT NULL,
    "actionData" JSONB NOT NULL,
    "result" "InteractionResult" NOT NULL,
    "attemptIndex" INTEGER NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "clientTimestamp" TIMESTAMPTZ(3) NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InteractionEvent_pkey" PRIMARY KEY ("eventId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Child_userId_key" ON "Child"("userId");

-- CreateIndex
CREATE INDEX "PlaySession_childId_startedAt_idx" ON "PlaySession"("childId", "startedAt");

-- CreateIndex
CREATE INDEX "PlaySession_childId_status_idx" ON "PlaySession"("childId", "status");

-- CreateIndex
CREATE INDEX "PlaySession_versionId_idx" ON "PlaySession"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaySession_childId_startRequestId_key" ON "PlaySession"("childId", "startRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "InteractionEvent_sessionId_attemptIndex_key" ON "InteractionEvent"("sessionId", "attemptIndex");

-- AddForeignKey
ALTER TABLE "Child" ADD CONSTRAINT "Child_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaySession" ADD CONSTRAINT "PlaySession_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("childId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaySession" ADD CONSTRAINT "PlaySession_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ActivityVersion"("versionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteractionEvent" ADD CONSTRAINT "InteractionEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PlaySession"("sessionId") ON DELETE CASCADE ON UPDATE CASCADE;
COMMIT;
