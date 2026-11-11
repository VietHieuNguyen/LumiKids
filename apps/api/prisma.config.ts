import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

config({
  path: [
    fileURLToPath(
      new URL(`.env.${process.env.NODE_ENV || 'development'}`, import.meta.url),
    ),
    fileURLToPath(new URL('.env', import.meta.url)),
  ],
  quiet: true,
});

export default defineConfig({
  schema: 'prisma/schema.prisma',
  // Generate/validate also work in CI without database credentials.
  // Commands that connect to PostgreSQL require DATABASE_URL.
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
