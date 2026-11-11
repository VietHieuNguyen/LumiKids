import { GameAssetRepository } from './game-asset.repository.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { listAssetsSchema } from './dto/game-asset.dto.js';
import { assetFixture } from '../../../test/game-asset.fixtures.js';

describe('GameAsset query construction', () => {
  it('applies name/type/all-tags/JSON scalar filters and bounded ordered pagination', async () => {
    const prisma = {
      gameAsset: {
        findMany: vi.fn().mockResolvedValue([assetFixture]),
        count: vi.fn().mockResolvedValue(11),
      },
      $transaction: vi.fn((queries: Promise<unknown>[]) =>
        Promise.all(queries),
      ),
    };
    const repository = new GameAssetRepository(
      prisma as unknown as PrismaService,
    );
    const query = listAssetsSchema.parse({
      page: '2',
      pageSize: '10',
      search: 'ball',
      objectType: 'BALL',
      tags: '["RED","toy"]',
      attributes: '{"color":"RED"}',
    });
    const result = await repository.list(query);
    const where = {
      status: 'ACTIVE',
      name: { contains: 'ball', mode: 'insensitive' },
      objectType: 'BALL',
      tags: { hasEvery: ['red', 'toy'] },
      AND: [{ attributes: { path: ['color'], equals: 'RED' } }],
    };
    expect(prisma.gameAsset.findMany).toHaveBeenCalledWith({
      where,
      skip: 10,
      take: 10,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    expect(prisma.gameAsset.count).toHaveBeenCalledWith({ where });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Array), {
      isolationLevel: 'RepeatableRead',
    });
    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 10,
      total: 11,
      totalPages: 2,
    });
  });
});
