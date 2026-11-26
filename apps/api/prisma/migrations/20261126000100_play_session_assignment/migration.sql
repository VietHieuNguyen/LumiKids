CREATE TYPE "PlayContext" AS ENUM ('SCHOOL', 'HOME');

ALTER TABLE "PlaySession"
    ADD COLUMN "assignmentId" UUID,
    ADD COLUMN "context" "PlayContext",
    ADD COLUMN "ageGroup" VARCHAR(3),
    ADD COLUMN "difficulty" "GameDifficulty",
    ADD COLUMN "hintLimitPerTask" INTEGER;

CREATE INDEX "PlaySession_assignmentId_childId_idx" ON "PlaySession"("assignmentId", "childId");

ALTER TABLE "PlaySession"
    ADD CONSTRAINT "PlaySession_assignmentId_versionId_fkey"
    FOREIGN KEY ("assignmentId", "versionId") REFERENCES "ActivityAssignmentItem"("assignmentId", "versionId")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PlaySession"
    ADD CONSTRAINT "PlaySession_assignmentId_childId_fkey"
    FOREIGN KEY ("assignmentId", "childId") REFERENCES "ActivityRecipient"("assignmentId", "childId")
    ON DELETE RESTRICT ON UPDATE CASCADE;
