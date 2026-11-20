CREATE TABLE "SiteSetting" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "siteName" VARCHAR(60) NOT NULL DEFAULT 'LumiKids',
  "tagline" VARCHAR(160),
  "logoObjectKey" VARCHAR(255),
  "logoMimeType" VARCHAR(50),
  "landingScene" VARCHAR(30) NOT NULL DEFAULT 'VALLEY',
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "SiteSetting_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SiteSetting_single_row" CHECK ("id" = 1)
);
