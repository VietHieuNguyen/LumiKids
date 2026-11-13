BEGIN;

INSERT INTO "Role" ("roleId", "code") VALUES (gen_random_uuid(), 'ROLE_CHILD')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "Permission" ("permissionId", "code")
VALUES (gen_random_uuid(), 'READ_OWN_ACCOUNT'),
       (gen_random_uuid(), 'PLAY_GAMES'),
       (gen_random_uuid(), 'SUBMIT_OWN_INTERACTIONS'),
       (gen_random_uuid(), 'READ_OWN_PLAY_SESSIONS')
ON CONFLICT ("code") DO NOTHING;

-- No new permissions are granted to existing adult roles.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."roleId", p."permissionId" FROM "Role" r CROSS JOIN "Permission" p
WHERE r."code" = 'ROLE_CHILD'
  AND p."code" IN ('READ_OWN_ACCOUNT', 'PLAY_GAMES', 'SUBMIT_OWN_INTERACTIONS', 'READ_OWN_PLAY_SESSIONS')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

COMMIT;
