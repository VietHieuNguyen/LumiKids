import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { verifierMatches } from './refresh-token.js';

export type RotationResult = 'rotated' | 'invalid' | 'reused';

@Injectable()
export class AuthSessionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    userId: string,
    token: { tokenId: string; verifier: string },
    expiresAt: Date,
  ) {
    return this.prisma.authSession.create({
      data: {
        userId,
        expiresAt,
        tokens: {
          create: {
            tokenId: token.tokenId,
            verifier: token.verifier,
            expiresAt,
          },
        },
      },
    });
  }

  find(tokenId: string) {
    return this.prisma.refreshToken.findUnique({
      where: { tokenId },
      include: { session: true },
    });
  }

  private async lockSession(
    tx: Prisma.TransactionClient,
    sessionId: string,
  ): Promise<void> {
    await tx.$queryRaw`SELECT "sessionId" FROM "AuthSession" WHERE "sessionId" = ${sessionId}::uuid FOR UPDATE`;
  }

  async rotate(
    tokenId: string,
    value: string,
    replacement: { tokenId: string; verifier: string },
  ): Promise<RotationResult> {
    return this.prisma.$transaction(
      async (tx) => {
        const candidate = await tx.refreshToken.findUnique({
          where: { tokenId },
        });
        if (!candidate || !verifierMatches(value, candidate.verifier))
          return 'invalid';
        // All refresh/logout operations for one family serialize on this row.
        await this.lockSession(tx, candidate.sessionId);
        const token = await tx.refreshToken.findUnique({
          where: { tokenId },
          include: { session: true },
        });
        const now = new Date();
        if (
          !token ||
          token.session.revokedAt ||
          token.session.expiresAt <= now ||
          token.expiresAt <= now
        )
          return 'invalid';
        if (token.usedAt) {
          // Return rather than throw so the replay revocation commits.
          await tx.authSession.update({
            where: { sessionId: token.sessionId },
            data: { revokedAt: now },
          });
          return 'reused';
        }
        const claimed = await tx.refreshToken.updateMany({
          where: { tokenId, usedAt: null },
          data: { usedAt: now },
        });
        if (claimed.count !== 1) return 'invalid';
        await tx.refreshToken.create({
          data: {
            tokenId: replacement.tokenId,
            verifier: replacement.verifier,
            sessionId: token.sessionId,
            expiresAt: token.session.expiresAt,
          },
        });
        return 'rotated';
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  async revoke(tokenId: string, value: string): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        const token = await tx.refreshToken.findUnique({ where: { tokenId } });
        if (!token || !verifierMatches(value, token.verifier)) return;
        await this.lockSession(tx, token.sessionId);
        await tx.authSession.updateMany({
          where: { sessionId: token.sessionId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }
}
