import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { AuthSessionsRepository } from '../src/modules/auth/auth-sessions.repository.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import { newRefreshToken } from '../src/modules/auth/refresh-token.js';

const testUrl = process.env.TEST_DATABASE_URL;

// Never falls back to DATABASE_URL or applies migrations automatically.
describe.skipIf(!testUrl)(
  'Auth sessions with real PostgreSQL (explicit test DB only)',
  () => {
    let prisma: PrismaService;
    let sessions: AuthSessionsRepository;
    let userId: string;

    beforeAll(async () => {
      if (!testUrl) throw new Error('TEST_DATABASE_URL is required.');
      let safeTarget = false;
      try {
        const url = new URL(testUrl);
        const database = decodeURIComponent(url.pathname.slice(1));
        safeTarget =
          ['postgresql:', 'postgres:'].includes(url.protocol) &&
          ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
          database.endsWith('_test') &&
          database !== 'lumikids_db';
      } catch {
        /* Never print a connection string. */
      }
      if (!safeTarget)
        throw new Error(
          'Integration tests require a local dedicated database whose name ends in _test.',
        );
      prisma = new PrismaService({ url: testUrl });
      sessions = new AuthSessionsRepository(prisma);
      await prisma.onModuleInit();
    });
    beforeEach(async () => {
      userId = randomUUID();
      await prisma.user.create({
        data: {
          userId,
          email: `${userId}@example.test`,
          fullName: 'Integration fixture',
          phone: '',
          address: '',
          status: 'ACTIVE',
          passwordHash: await new PasswordService().hash(
            randomBytes(24).toString('base64url'),
          ),
        },
      });
    });
    afterEach(async () => {
      if (prisma && userId) await prisma.user.deleteMany({ where: { userId } });
    });
    afterAll(async () => {
      if (prisma) await prisma.onModuleDestroy();
    });

    it('serializes simultaneous rotations and commits replay revocation', async () => {
      const first = newRefreshToken();
      const session = await sessions.create(
        userId,
        first,
        new Date(Date.now() + 60000),
      );
      const results = await Promise.all([
        sessions.rotate(first.tokenId, first.value, newRefreshToken()),
        sessions.rotate(first.tokenId, first.value, newRefreshToken()),
      ]);
      expect(results.sort((a, b) => a.localeCompare(b))).toEqual([
        'reused',
        'rotated',
      ]);
      expect(
        (
          await prisma.authSession.findUniqueOrThrow({
            where: { sessionId: session.sessionId },
          })
        ).revokedAt,
      ).not.toBeNull();
      const tokens = await prisma.refreshToken.findMany({
        where: { sessionId: session.sessionId },
      });
      expect(tokens).toHaveLength(2);
      expect(tokens.filter((token) => token.usedAt === null)).toHaveLength(1);
      expect(JSON.stringify(tokens)).not.toContain(first.value);
    });
    it('does not revoke a session for a forged verifier and rejects refresh after logout', async () => {
      const token = newRefreshToken();
      const session = await sessions.create(
        userId,
        token,
        new Date(Date.now() + 60000),
      );
      const forged = `${token.tokenId}.${newRefreshToken().value.split('.')[1]}`;
      expect(
        await sessions.rotate(token.tokenId, forged, newRefreshToken()),
      ).toBe('invalid');
      expect(
        (
          await prisma.authSession.findUniqueOrThrow({
            where: { sessionId: session.sessionId },
          })
        ).revokedAt,
      ).toBeNull();
      await sessions.revoke(token.tokenId, token.value);
      expect(
        await sessions.rotate(token.tokenId, token.value, newRefreshToken()),
      ).toBe('invalid');
    });
    it('rejects an expired refresh token without issuing a successor', async () => {
      const token = newRefreshToken();
      const session = await sessions.create(userId, token, new Date(0));
      expect(
        await sessions.rotate(token.tokenId, token.value, newRefreshToken()),
      ).toBe('invalid');
      expect(
        await prisma.refreshToken.count({
          where: { sessionId: session.sessionId },
        }),
      ).toBe(1);
    });
  },
);
