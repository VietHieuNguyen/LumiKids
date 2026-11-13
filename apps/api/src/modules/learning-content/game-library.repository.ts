import { Injectable } from '@nestjs/common';
import type { GameLibraryQuery, SaveGameInput } from '@lumikids/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

const include = {
  activity: { include: { creator: { select: { fullName: true } } } },
  criterions: { select: { criterionCode: true } },
} as const;
export type LibraryVersion = Prisma.ActivityVersionGetPayload<{
  include: typeof include;
}>;

@Injectable()
export class GameLibraryRepository {
  constructor(private readonly prisma: PrismaService) {}
  find(versionId: string) {
    return this.prisma.activityVersion.findUnique({
      where: { versionId },
      include,
    });
  }
  findRequest(createdBy: string, saveRequestId: string) {
    return this.prisma.activity.findUnique({
      where: { createdBy_saveRequestId: { createdBy, saveRequestId } },
      include: {
        versions: {
          select: { versionId: true },
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
      },
    });
  }
  async create(userId: string, input: SaveGameInput, saveFingerprint: string) {
    return this.prisma.activity.create({
      data: {
        name: input.name,
        description: input.description,
        createdBy: userId,
        saveRequestId: input.saveRequestId,
        saveFingerprint,
        versions: {
          create: {
            versionNumber: 1,
            instruction: input.content.instruction,
            difficulty: input.difficulty,
            gameType: input.content.gameType,
            completionRule: input.content.completionRule,
            content: input.content as Prisma.InputJsonValue,
            criterions: {
              create: input.criterionCodes.map((criterionCode) => ({
                criterionCode,
              })),
            },
          },
        },
      },
      include: { versions: { select: { versionId: true }, take: 1 } },
    });
  }
  async list(query: GameLibraryQuery, userId: string, canManageAll: boolean) {
    const where: Prisma.ActivityVersionWhereInput = {
      gameType: query.gameType,
      difficulty: query.difficulty,
      activity: {
        status: query.status,
        ...(query.mine === 'true' ||
        (query.status === 'ARCHIVED' && !canManageAll)
          ? { createdBy: userId }
          : {}),
        ...(query.search
          ? {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' } },
                {
                  description: { contains: query.search, mode: 'insensitive' },
                },
              ],
            }
          : {}),
      },
      ...(query.skillCode || query.criterionCode
        ? {
            criterions: {
              some: {
                criterionCode: query.criterionCode,
                criterion: { skillCode: query.skillCode },
              },
            },
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.activityVersion.findMany({
        where,
        include,
        orderBy: [{ createdAt: 'desc' }, { versionId: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.activityVersion.count({ where }),
    ]);
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
  setStatus(activityId: string, status: 'ACTIVE' | 'ARCHIVED') {
    return this.prisma.activity.update({
      where: { activityId },
      data: { status },
    });
  }
}
