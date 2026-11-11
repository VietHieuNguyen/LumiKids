import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma.module.js';
import { apiEnvFiles } from '../common/config/env-files.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: apiEnvFiles() }),
    PrismaModule,
  ],
})
class DatabaseCheckModule {}

let app: INestApplication | undefined;

try {
  // PrismaService's initialization runs SELECT 1, without opening an HTTP port.
  app = await NestFactory.create(DatabaseCheckModule, {
    logger: false,
    abortOnError: false,
  });
  await app.init();
  console.log('PostgreSQL connection OK (SELECT 1).');
} catch {
  console.error(
    'PostgreSQL connection check failed. Verify the database and DATABASE_URL.',
  );
  process.exitCode = 1;
} finally {
  try {
    await app?.close();
  } catch {
    console.error('Could not close the PostgreSQL connection.');
    process.exitCode = 1;
  }
}
