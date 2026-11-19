import { Reflector } from '@nestjs/core';
import { TokenUsageService } from './token-usage.service.js';
import { TokenUsageController } from './token-usage.controller.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { adminFixture } from '../../../test/game-asset.fixtures.js';
import { tokenUsageQuerySchema } from '@lumikids/shared';
import {
  REQUIRED_PERMISSIONS,
  REQUIRED_ROLES,
} from '../auth/decorators/auth.decorators.js';

const query = tokenUsageQuerySchema.parse({
  from: '2026-11-01',
  to: '2026-11-20',
});
describe('token usage access and accounting', () => {
  function setup() {
    const db = {
      user: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            {
              userId: adminFixture.userId,
              fullName: 'Teacher',
              email: 'teacher@test.local',
            },
          ]),
      },
      aiTokenUsage: {
        groupBy: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn().mockResolvedValue({}),
      },
      $transaction: vi
        .fn()
        .mockResolvedValue([
          [
            {
              userId: adminFixture.userId,
              _count: { _all: 3, totalTokens: 2 },
              _sum: {
                inputTokens: 100,
                outputTokens: 20,
                thoughtTokens: 5,
                cachedTokens: 10,
                totalTokens: 125,
              },
            },
          ],
          [],
          3,
        ]),
    };
    return {
      db,
      service: new TokenUsageService(db as unknown as PrismaService),
    };
  }
  it('ignores supplied foreign userId for own reports and uses Vietnam day boundaries', async () => {
    const { db, service } = setup();
    const teacher = {
      ...adminFixture,
      roles: ['ROLE_TEACHER' as const],
      permissions: ['READ_OWN_ACCOUNT' as const],
    };
    const result = await service.report(
      teacher,
      { ...query, userId: '00000000-0000-4000-8000-000000000099' },
      false,
    );
    expect(db.user.findMany.mock.calls[0][0].where.userId).toBe(teacher.userId);
    const where = db.aiTokenUsage.groupBy.mock.calls[0][0].where;
    expect(where.createdAt.gte.toISOString()).toBe('2026-10-31T17:00:00.000Z');
    expect(where.createdAt.lt.toISOString()).toBe('2026-11-20T17:00:00.000Z');
    expect(result.totals).toMatchObject({
      calls: 3,
      unknownCalls: 1,
      totalTokens: 125,
      cachedTokens: 10,
    });
  });
  it('rejects teacher cross-account reports before querying the database', async () => {
    const { db, service } = setup();
    await expect(
      service.report(
        {
          ...adminFixture,
          roles: ['ROLE_TEACHER'],
          permissions: ['MANAGE_USERS'],
        },
        query,
        true,
      ),
    ).rejects.toThrow();
    expect(db.user.findMany).not.toHaveBeenCalled();
  });
  it('keeps unknown provider usage null, rather than fabricating zero tokens', async () => {
    const { db, service } = setup();
    await service.record(
      adminFixture.userId,
      { requestId: 'fixture', attempt: 2, gameType: 'COUNTING' } as never,
      'AI_TIMEOUT',
    );
    expect(db.aiTokenUsage.create.mock.calls[0][0].data).toMatchObject({
      totalTokens: null,
      inputTokens: null,
      attempt: 2,
      userId: adminFixture.userId,
    });
  });
  it('protects the admin endpoint with role and permission guards', () => {
    const reflector = new Reflector();
    expect(
      reflector.get(REQUIRED_ROLES, TokenUsageController.prototype.teachers),
    ).toEqual(['ROLE_ADMIN']);
    expect(
      reflector.get(
        REQUIRED_PERMISSIONS,
        TokenUsageController.prototype.teachers,
      ),
    ).toEqual(['MANAGE_USERS']);
  });
  it('rejects invalid dates, unknown filters and unbounded report ranges', () => {
    for (const input of [
      { ...query, to: '2026-02-30' },
      { ...query, from: '2025-01-01' },
      { ...query, to: '2026-10-01' },
      { ...query, fake: true },
    ])
      expect(tokenUsageQuerySchema.safeParse(input).success).toBe(false);
  });
});
