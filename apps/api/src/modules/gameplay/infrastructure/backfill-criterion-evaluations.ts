/**
 * One-off: scores COMPLETED sessions that finished before CriterionEvaluation existed.
 * Additive and idempotent — only sessions without an evaluation are touched; events are
 * replayed through the shared engine first, so a session whose events no longer verify is skipped.
 * Run: pnpm --filter api db:backfill:evaluations
 */
import type { INestApplication } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { gameContentSchema } from '@lumikids/shared';
import { apiEnvFiles } from '../../../common/config/env-files.js';
import { PrismaModule } from '../../../prisma/prisma.module.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { evaluateCriterion } from '../domain/criterion-evaluation.js';
import { computeSessionPerformance } from '../domain/session-performance.js';
import { replaySession } from '../domain/session-replay.js';
import { PrismaPlaySessionRepository } from './prisma-play-session.repository.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: apiEnvFiles() }),
    PrismaModule,
  ],
  providers: [PrismaPlaySessionRepository],
})
class BackfillModule {}

async function backfill(app: INestApplication): Promise<void> {
  const prisma = app.get(PrismaService);
  const sessions = app.get(PrismaPlaySessionRepository);
  const pending = await prisma.playSession.findMany({
    where: { status: 'COMPLETED', evaluation: null },
    select: {
      sessionId: true,
      versionId: true,
      startedAt: true,
      endedAt: true,
      version: { select: { content: true } },
    },
    orderBy: { startedAt: 'asc' },
  });
  let scored = 0;
  let skipped = 0;
  for (const row of pending) {
    try {
      const content = gameContentSchema.parse(row.version.content);
      const events = await sessions.listInteractions(row.sessionId);
      if (!replaySession(content, events).completed)
        throw new Error('events do not complete the game');
      const performance = computeSessionPerformance({
        content,
        events,
        criterionCode: await sessions.primaryCriterionCode(row.versionId),
        startedAt: row.startedAt,
        endedAt: row.endedAt,
      });
      const evaluation = evaluateCriterion(performance);
      await prisma.$transaction(async (tx) => {
        // Only COMPLETED sessions without an evaluation get here; completed sessions never change.
        await tx.playSession.update({
          where: { sessionId: row.sessionId },
          data: { performance },
        });
        if (evaluation)
          await tx.criterionEvaluation.createMany({
            data: [{ sessionId: row.sessionId, ...evaluation }],
            skipDuplicates: true,
          });
      });
      scored++;
      console.log(
        `scored ${row.sessionId}: criterion ${evaluation?.criterionCode ?? '-'}, score ${evaluation?.score ?? '-'}`,
      );
    } catch (error) {
      skipped++;
      console.warn(
        `skipped ${row.sessionId}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
  console.log(`Done. ${scored} scored, ${skipped} skipped, ${pending.length} pending.`);
}

let app: INestApplication | undefined;
try {
  app = await NestFactory.create(BackfillModule, {
    logger: false,
    abortOnError: false,
  });
  await app.init();
  await backfill(app);
} catch {
  console.error('Backfill failed. Verify the database and DATABASE_URL.');
  process.exitCode = 1;
} finally {
  await app?.close();
}
