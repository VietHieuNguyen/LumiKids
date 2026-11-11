import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { GenerationAssetRow } from './dto/generation-asset.js';
import type {
  ListAssetsInput,
  UpdateAssetInput,
} from './dto/game-asset.dto.js';

@Injectable()
export class GameAssetRepository {
  constructor(private readonly prisma: PrismaService) {}

  async searchForGeneration(terms: string[]): Promise<GenerationAssetRow[]> {
    if (!terms.length) return [];
    // Parameterized, accent-insensitive Vietnamese metadata search; no DB extension/migration.
    const accented =
      'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ';
    const folded = accented
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/đ/g, 'd');
    return this.prisma.$queryRaw<GenerationAssetRow[]>(Prisma.sql`
      WITH documents AS (
        SELECT id, name, "objectType", tags, attributes, status,
          translate(lower(concat_ws(' ', name, "objectType", array_to_string(tags, ' '), attributes::text)), ${accented}, ${folded}) AS document,
          translate(lower(concat_ws(' ', name, "objectType", array_to_string(tags, ' '))), ${accented}, ${folded}) AS identity_document
        FROM "GameAsset" WHERE status = 'ACTIVE'
      ), ranked AS (
        SELECT *, (SELECT coalesce(sum((CASE WHEN strpos(identity_document, term) > 0 THEN 4 ELSE 1 END) * (CASE WHEN strpos(term, ' ') > 0 THEN 3 ELSE 1 END)), 0) FROM unnest(${terms}::text[]) AS term WHERE strpos(document, term) > 0) AS relevance,
          row_number() OVER (PARTITION BY "objectType", attributes->>'color', attributes->>'shape', attributes->>'variant', attributes->>'lifeStage' ORDER BY id) AS position
        FROM documents WHERE EXISTS (SELECT 1 FROM unnest(${terms}::text[]) AS term WHERE strpos(document, term) > 0)
      )
      SELECT id, name, "objectType", tags, attributes, status FROM ranked
      ORDER BY position, relevance DESC, id LIMIT 120
    `);
  }

  findForGeneration(ids: string[]) {
    return this.prisma.gameAsset.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        name: true,
        objectType: true,
        tags: true,
        attributes: true,
        status: true,
      },
    });
  }

  create(data: Prisma.GameAssetUncheckedCreateInput) {
    return this.prisma.gameAsset.create({ data });
  }
  findById(id: string) {
    return this.prisma.gameAsset.findUnique({ where: { id } });
  }
  update(
    id: string,
    data: UpdateAssetInput | { status: 'ACTIVE' | 'INACTIVE' },
  ) {
    return this.prisma.gameAsset.update({ where: { id }, data });
  }

  async list(query: ListAssetsInput) {
    const where: Prisma.GameAssetWhereInput = {
      status: query.status,
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' } }
        : {}),
      ...(query.objectType ? { objectType: query.objectType } : {}),
      ...(query.tags?.length ? { tags: { hasEvery: query.tags } } : {}),
      ...(query.attributes
        ? {
            AND: Object.entries(query.attributes).map(([key, value]) => ({
              attributes: { path: [key], equals: value },
            })),
          }
        : {}),
    };
    // Same snapshot for count and rows. Never return an unbounded asset library.
    const [items, total] = await this.prisma.$transaction(
      [
        this.prisma.gameAsset.findMany({
          where,
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
        this.prisma.gameAsset.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      items,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }
}
