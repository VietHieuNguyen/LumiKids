-- Score of a completed PlaySession for its version's single AssessmentCriterion (rule ce-score-v1).
-- Additive only: no existing row is changed; level/summary stay NULL until the assessment/AI phase.

-- CreateEnum
CREATE TYPE "CriterionLevel" AS ENUM ('LEVEL_0', 'LEVEL_1', 'LEVEL_2', 'LEVEL_3', 'LEVEL_4');

-- AlterTable
ALTER TABLE "PlaySession" ADD COLUMN     "performance" JSONB;

-- CreateTable
CREATE TABLE "CriterionEvaluation" (
    "criterionEvaluationId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "criterionCode" VARCHAR(20) NOT NULL,
    "score" DOUBLE PRECISION,
    "level" "CriterionLevel",
    "summary" TEXT,
    "minimumItemsMet" BOOLEAN NOT NULL,
    "ruleVersion" VARCHAR(40) NOT NULL,
    "evaluatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CriterionEvaluation_pkey" PRIMARY KEY ("criterionEvaluationId")
);

-- CreateIndex
CREATE UNIQUE INDEX "CriterionEvaluation_sessionId_key" ON "CriterionEvaluation"("sessionId");

-- CreateIndex
CREATE INDEX "CriterionEvaluation_criterionCode_idx" ON "CriterionEvaluation"("criterionCode");

-- AddForeignKey
ALTER TABLE "CriterionEvaluation" ADD CONSTRAINT "CriterionEvaluation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PlaySession"("sessionId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriterionEvaluation" ADD CONSTRAINT "CriterionEvaluation_criterionCode_fkey" FOREIGN KEY ("criterionCode") REFERENCES "AssessmentCriterion"("criterionCode") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Hand-written: score is an unrounded percentage.
ALTER TABLE "CriterionEvaluation" ADD CONSTRAINT "CriterionEvaluation_score_check" CHECK ("score" IS NULL OR ("score" >= 0 AND "score" <= 100));
