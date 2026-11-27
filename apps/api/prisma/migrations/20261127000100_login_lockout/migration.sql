-- FR-1.1 AC-02: count wrong passwords and lock sign-in after five in a row.
ALTER TABLE "User" ADD COLUMN "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lockedUntil" TIMESTAMPTZ(3);
