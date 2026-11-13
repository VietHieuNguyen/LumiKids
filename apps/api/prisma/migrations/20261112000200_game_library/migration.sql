BEGIN;
-- CreateEnum
CREATE TYPE "ActivityStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "GameDifficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "GameType" AS ENUM ('COUNTING', 'MATCHING', 'CLASSIFICATION');

-- CreateEnum
CREATE TYPE "CompletionRule" AS ENUM ('CORRECT_CHOICE', 'ALL_PAIRS_CORRECT', 'ALL_ITEMS_CLASSIFIED_CORRECTLY');

-- CreateTable
CREATE TABLE "Skill" (
    "skillCode" VARCHAR(20) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("skillCode")
);

-- CreateTable
CREATE TABLE "AssessmentCriterion" (
    "criterionCode" VARCHAR(20) NOT NULL,
    "description" TEXT NOT NULL,
    "skillCode" VARCHAR(20) NOT NULL,
    "displayOrder" INTEGER NOT NULL,

    CONSTRAINT "AssessmentCriterion_pkey" PRIMARY KEY ("criterionCode")
);

-- CreateTable
CREATE TABLE "Activity" (
    "activityId" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" VARCHAR(1000) NOT NULL DEFAULT '',
    "createdBy" UUID NOT NULL,
    "status" "ActivityStatus" NOT NULL DEFAULT 'ACTIVE',
    "saveRequestId" UUID NOT NULL,
    "saveFingerprint" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("activityId")
);

-- CreateTable
CREATE TABLE "ActivityVersion" (
    "versionId" UUID NOT NULL,
    "activityId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "instruction" TEXT NOT NULL,
    "difficulty" "GameDifficulty" NOT NULL,
    "gameType" "GameType" NOT NULL,
    "content" JSONB NOT NULL,
    "completionRule" "CompletionRule" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityVersion_pkey" PRIMARY KEY ("versionId")
);

-- CreateTable
CREATE TABLE "ActivityVersionCriterion" (
    "versionId" UUID NOT NULL,
    "criterionCode" VARCHAR(20) NOT NULL,

    CONSTRAINT "ActivityVersionCriterion_pkey" PRIMARY KEY ("versionId","criterionCode")
);

-- CreateIndex
CREATE INDEX "AssessmentCriterion_skillCode_displayOrder_idx" ON "AssessmentCriterion"("skillCode", "displayOrder");

-- CreateIndex
CREATE INDEX "Activity_status_createdAt_activityId_idx" ON "Activity"("status", "createdAt", "activityId");

-- CreateIndex
CREATE INDEX "Activity_createdBy_status_idx" ON "Activity"("createdBy", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Activity_createdBy_saveRequestId_key" ON "Activity"("createdBy", "saveRequestId");

-- CreateIndex
CREATE INDEX "ActivityVersion_gameType_difficulty_idx" ON "ActivityVersion"("gameType", "difficulty");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityVersion_activityId_versionNumber_key" ON "ActivityVersion"("activityId", "versionNumber");

-- CreateIndex
CREATE INDEX "ActivityVersionCriterion_criterionCode_idx" ON "ActivityVersionCriterion"("criterionCode");

-- AddForeignKey
ALTER TABLE "AssessmentCriterion" ADD CONSTRAINT "AssessmentCriterion_skillCode_fkey" FOREIGN KEY ("skillCode") REFERENCES "Skill"("skillCode") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityVersion" ADD CONSTRAINT "ActivityVersion_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("activityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityVersionCriterion" ADD CONSTRAINT "ActivityVersionCriterion_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ActivityVersion"("versionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityVersionCriterion" ADD CONSTRAINT "ActivityVersionCriterion_criterionCode_fkey" FOREIGN KEY ("criterionCode") REFERENCES "AssessmentCriterion"("criterionCode") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "Skill" ("skillCode","name","description","displayOrder") VALUES ('15','Số, đếm và đo lường','Trẻ em thực hiện các kỹ năng liên quan đến số, đếm, đo và biểu thị kết quả.',15);
INSERT INTO "AssessmentCriterion" ("criterionCode","skillCode","description","displayOrder") VALUES ('42','15','Tách, gộp số lượng trong phạm vi 10.',42);
INSERT INTO "AssessmentCriterion" ("criterionCode","skillCode","description","displayOrder") VALUES ('43','15','So sánh, thêm, bớt số lượng trong phạm vi 10.',43);
INSERT INTO "AssessmentCriterion" ("criterionCode","skillCode","description","displayOrder") VALUES ('44','15','Đo độ dài, dung tích của đối tượng bằng đơn vị đo ước lệ.',44);

INSERT INTO "Skill" ("skillCode","name","description","displayOrder") VALUES ('16','Hình dạng, quy tắc, không gian và thời gian','Trẻ em xác định hình dạng, quy tắc sắp xếp, định hướng trong không gian và thời gian.',16);
INSERT INTO "AssessmentCriterion" ("criterionCode","skillCode","description","displayOrder") VALUES ('45','16','Xác định một số hình phẳng và hình khối đơn giản trong cuộc sống xung quanh.',45);
INSERT INTO "AssessmentCriterion" ("criterionCode","skillCode","description","displayOrder") VALUES ('46','16','Sắp xếp theo quy tắc.',46);
INSERT INTO "AssessmentCriterion" ("criterionCode","skillCode","description","displayOrder") VALUES ('47','16','Xác định vị trí trong không gian theo vật chuẩn.',47);
INSERT INTO "AssessmentCriterion" ("criterionCode","skillCode","description","displayOrder") VALUES ('48','16','Phân biệt hôm qua, hôm nay, ngày mai và gọi tên các ngày trong tuần theo thứ tự.',48);
INSERT INTO "AssessmentCriterion" ("criterionCode","skillCode","description","displayOrder") VALUES ('49','16','Xác định giờ đúng trên đồng hồ.',49);

INSERT INTO "Skill" ("skillCode","name","description","displayOrder") VALUES ('17','Khám phá khoa học','Trẻ em nhận biết và thực hiện khám phá khoa học.',17);
INSERT INTO "AssessmentCriterion" ("criterionCode","skillCode","description","displayOrder") VALUES ('50','17','Nhận biết một số đặc điểm nổi bật và sự thay đổi của môi trường tự nhiên.',50);
INSERT INTO "AssessmentCriterion" ("criterionCode","skillCode","description","displayOrder") VALUES ('51','17','Phân loại một số sự vật thành nhóm theo đặc điểm chung.',51);
INSERT INTO "AssessmentCriterion" ("criterionCode","skillCode","description","displayOrder") VALUES ('52','17','Giải thích mối quan hệ giữa đặc điểm của một số loài động vật, thực vật với môi trường sống.',52);

INSERT INTO "Permission" ("permissionId","code") VALUES (gen_random_uuid(),'READ_GAMES'),(gen_random_uuid(),'SAVE_GAMES'),(gen_random_uuid(),'MANAGE_ALL_GAMES') ON CONFLICT ("code") DO NOTHING;
INSERT INTO "RolePermission" ("roleId","permissionId") SELECT r."roleId",p."permissionId" FROM "Role" r CROSS JOIN "Permission" p WHERE (r."code" IN ('ROLE_ADMIN','ROLE_TEACHER') AND p."code" IN ('READ_GAMES','SAVE_GAMES')) OR (r."code"='ROLE_ADMIN' AND p."code"='MANAGE_ALL_GAMES') ON CONFLICT ("roleId","permissionId") DO NOTHING;

COMMIT;
