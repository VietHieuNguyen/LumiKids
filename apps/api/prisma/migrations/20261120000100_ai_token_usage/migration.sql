CREATE TABLE "AiTokenUsage" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "requestId" UUID NOT NULL,
  "attempt" INTEGER NOT NULL,
  "gameType" VARCHAR(30) NOT NULL,
  "model" VARCHAR(100),
  "status" VARCHAR(60) NOT NULL,
  "inputTokens" INTEGER,
  "outputTokens" INTEGER,
  "thoughtTokens" INTEGER,
  "cachedTokens" INTEGER,
  "totalTokens" INTEGER,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiTokenUsage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AiTokenUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AiTokenUsage_requestId_attempt_key" ON "AiTokenUsage"("requestId", "attempt");
CREATE INDEX "AiTokenUsage_userId_createdAt_idx" ON "AiTokenUsage"("userId", "createdAt");
CREATE INDEX "AiTokenUsage_createdAt_idx" ON "AiTokenUsage"("createdAt");
