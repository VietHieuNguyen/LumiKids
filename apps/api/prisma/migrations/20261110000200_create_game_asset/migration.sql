-- Prepared using prisma migrate diff (schema-to-schema; no DB connection).
BEGIN;

CREATE TYPE "GameAssetStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE "GameAsset" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "objectKey" VARCHAR(200) NOT NULL,
    "originalFileName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(30) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "objectType" VARCHAR(40) NOT NULL,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "status" "GameAssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdBy" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "GameAsset_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "GameAsset_sizeBytes_check" CHECK ("sizeBytes" > 0),
    CONSTRAINT "GameAsset_attributes_check" CHECK (jsonb_typeof("attributes") = 'object')
);

CREATE UNIQUE INDEX "GameAsset_objectKey_key" ON "GameAsset"("objectKey");
CREATE INDEX "GameAsset_status_objectType_createdAt_id_idx" ON "GameAsset"("status", "objectType", "createdAt", "id");
CREATE INDEX "GameAsset_tags_idx" ON "GameAsset" USING GIN ("tags");
CREATE INDEX "GameAsset_createdBy_idx" ON "GameAsset"("createdBy");
ALTER TABLE "GameAsset" ADD CONSTRAINT "GameAsset_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- Additive grants for existing roles. No account/password changes or new users.
INSERT INTO "Permission" ("permissionId", "code")
VALUES (gen_random_uuid(), 'READ_GAME_ASSETS'), (gen_random_uuid(), 'MANAGE_GAME_ASSETS')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."roleId", p."permissionId"
FROM "Role" r CROSS JOIN "Permission" p
WHERE r."code" = 'ROLE_ADMIN' AND p."code" IN ('READ_GAME_ASSETS', 'MANAGE_GAME_ASSETS')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

COMMIT;
