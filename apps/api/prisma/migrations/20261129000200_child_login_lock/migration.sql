-- Admin locks a child's sign-in while the child is in a class (FR-1.5). Each lock is kept; unlock sets unlockedAt.
CREATE TABLE "ChildLoginLock" (
    "lockId" UUID NOT NULL,
    "childId" UUID NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "lockedById" UUID NOT NULL,
    "lockedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unlockedAt" TIMESTAMPTZ(3),
    "unlockedById" UUID,
    CONSTRAINT "ChildLoginLock_pkey" PRIMARY KEY ("lockId")
);

CREATE INDEX "ChildLoginLock_childId_unlockedAt_idx" ON "ChildLoginLock"("childId", "unlockedAt");

ALTER TABLE "ChildLoginLock" ADD CONSTRAINT "ChildLoginLock_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("childId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChildLoginLock" ADD CONSTRAINT "ChildLoginLock_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChildLoginLock" ADD CONSTRAINT "ChildLoginLock_unlockedById_fkey" FOREIGN KEY ("unlockedById") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
