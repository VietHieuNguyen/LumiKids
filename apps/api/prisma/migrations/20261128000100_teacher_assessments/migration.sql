-- FR-3.1 teacher assessments: drafts and published notes with a revision history.
CREATE TYPE "TeacherAssessmentStatus" AS ENUM ('DRAFT', 'PUBLISHED');

CREATE TABLE "TeacherAssessment" (
    "assessmentId" UUID NOT NULL,
    "childId" UUID NOT NULL,
    "classId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "criterionCode" VARCHAR(4) NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "content" VARCHAR(2000) NOT NULL,
    "status" "TeacherAssessmentStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "TeacherAssessment_pkey" PRIMARY KEY ("assessmentId"),
    CONSTRAINT "TeacherAssessment_period_check" CHECK ("periodStart" <= "periodEnd"),
    CONSTRAINT "TeacherAssessment_criterion_check" CHECK ("criterionCode" ~ '^(4[2-9]|5[0-2])$')
);

CREATE INDEX "TeacherAssessment_childId_periodEnd_idx" ON "TeacherAssessment"("childId", "periodEnd");

ALTER TABLE "TeacherAssessment" ADD CONSTRAINT "TeacherAssessment_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("childId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TeacherAssessment" ADD CONSTRAINT "TeacherAssessment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Classroom"("classId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TeacherAssessment" ADD CONSTRAINT "TeacherAssessment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "TeacherAssessmentRevision" (
    "revisionId" UUID NOT NULL,
    "assessmentId" UUID NOT NULL,
    "revisionNo" INTEGER NOT NULL,
    "changedBy" UUID NOT NULL,
    "changedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" VARCHAR(500),
    "previous" JSONB NOT NULL,
    CONSTRAINT "TeacherAssessmentRevision_pkey" PRIMARY KEY ("revisionId")
);

CREATE UNIQUE INDEX "TeacherAssessmentRevision_assessmentId_revisionNo_key" ON "TeacherAssessmentRevision"("assessmentId", "revisionNo");

ALTER TABLE "TeacherAssessmentRevision" ADD CONSTRAINT "TeacherAssessmentRevision_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "TeacherAssessment"("assessmentId") ON DELETE CASCADE ON UPDATE CASCADE;
