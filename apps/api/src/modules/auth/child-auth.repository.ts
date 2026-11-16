import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { verifierMatches } from './refresh-token.js';
import type { RotationResult } from './auth-sessions.repository.js';

const childSelect = {
  childId: true,
  fullName: true,
  status: true,
} as const satisfies Prisma.ChildSelect;

export type ChildAccount = Prisma.ChildGetPayload<{
  select: typeof childSelect;
}>;

/**
 * Children and their sign-in sessions. The refresh-token rotation mirrors AuthSessionsRepository on the
 * ChildAuthSession/ChildRefreshToken tables (same reuse detection and row locking).
 */
@Injectable()
export class ChildAuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByCodeDigest(loginCodeDigest: string) {
    return this.prisma.child.findUnique({
      where: { loginCodeDigest },
      select: childSelect,
    });
  }

  findById(childId: string) {
    return this.prisma.child.findUnique({
      where: { childId },
      select: childSelect,
    });
  }

  /** A child may sign in only while enrolled in a class that is still active. */
  async hasCurrentClass(childId: string): Promise<boolean> {
    const count = await this.prisma.classroomEnrollment.count({
      where: { childId, endedAt: null, classroom: { status: 'ACTIVE' } },
    });
    return count > 0;
  }

  /**
   * Replaces the child's login code and signs the child out everywhere: whoever held the old code (or a
   * session opened with it) loses access at once. False if the digest collides with another child's code.
   */
  async replaceLoginCode(
    childId: string,
    loginCodeDigest: string,
    issuedAt: Date,
  ): Promise<boolean> {
    try {
      await this.prisma.$transaction([
        this.prisma.child.update({
          where: { childId },
          data: { loginCodeDigest, loginCodeIssuedAt: issuedAt },
        }),
        this.prisma.childAuthSession.updateMany({
          where: { childId, revokedAt: null },
          data: { revokedAt: issuedAt },
        }),
      ]);
      return true;
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      )
        return false;
      throw error;
    }
  }

  createSession(
    childId: string,
    token: { tokenId: string; verifier: string },
    expiresAt: Date,
  ) {
    return this.prisma.childAuthSession.create({
      data: {
        childId,
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

  findToken(tokenId: string) {
    return this.prisma.childRefreshToken.findUnique({
      where: { tokenId },
      include: { session: true },
    });
  }

  private async lockSession(
    tx: Prisma.TransactionClient,
    sessionId: string,
  ): Promise<void> {
    await tx.$queryRaw`SELECT "sessionId" FROM "ChildAuthSession" WHERE "sessionId" = ${sessionId}::uuid FOR UPDATE`;
  }

  async rotate(
    tokenId: string,
    value: string,
    replacement: { tokenId: string; verifier: string },
  ): Promise<RotationResult> {
    return this.prisma.$transaction(
      async (tx) => {
        const candidate = await tx.childRefreshToken.findUnique({
          where: { tokenId },
        });
        if (!candidate || !verifierMatches(value, candidate.verifier))
          return 'invalid';
        await this.lockSession(tx, candidate.sessionId);
        const token = await tx.childRefreshToken.findUnique({
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
          await tx.childAuthSession.update({
            where: { sessionId: token.sessionId },
            data: { revokedAt: now },
          });
          return 'reused';
        }
        const claimed = await tx.childRefreshToken.updateMany({
          where: { tokenId, usedAt: null },
          data: { usedAt: now },
        });
        if (claimed.count !== 1) return 'invalid';
        await tx.childRefreshToken.create({
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
        const token = await tx.childRefreshToken.findUnique({
          where: { tokenId },
        });
        if (!token || !verifierMatches(value, token.verifier)) return;
        await this.lockSession(tx, token.sessionId);
        await tx.childAuthSession.updateMany({
          where: { sessionId: token.sessionId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }
}
