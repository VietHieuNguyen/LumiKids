import { ForbiddenException, Injectable } from '@nestjs/common';
import type { TokenUsage, AiGenerationRequest } from '@lumikids/ai-client';
import type { TokenUsageQuery } from '@lumikids/shared';
import type { Principal } from '../../common/security/principal.js';
import { PrismaService } from '../../prisma/prisma.service.js';

/** Budget of one call (NFR-2). */
export const LATENCY_BUDGET_MS = 30000;

/** Nearest-rank percentile of ascending values. */
function percentile(sorted: readonly number[], p: number): number | null {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

export function latencyOf(rows: readonly { durationMs: number | null; status: string }[]) {
  const values = rows
    .flatMap((row) => (row.durationMs === null ? [] : [row.durationMs]))
    .sort((a, b) => a - b);
  return {
    measuredCalls: values.length,
    p50Ms: percentile(values, 50),
    p95Ms: percentile(values, 95),
    maxMs: values.length ? values[values.length - 1] : null,
    timeoutCalls: rows.filter((row) => row.status === 'AI_TIMEOUT').length,
    overBudgetCalls: values.filter((value) => value > LATENCY_BUDGET_MS).length,
  };
}

@Injectable()
export class TokenUsageService {
  constructor(private readonly db: PrismaService) {}

  record(
    userId: string,
    request: AiGenerationRequest,
    status: string,
    usage?: TokenUsage | null,
    model?: string,
    durationMs?: number,
  ) {
    return this.db.aiTokenUsage.create({
      data: {
        userId,
        requestId: request.requestId,
        attempt: request.attempt,
        gameType: request.gameType,
        status,
        model: model ?? null,
        inputTokens: usage?.inputTokens ?? null,
        outputTokens: usage?.outputTokens ?? null,
        thoughtTokens: usage?.thoughtTokens ?? null,
        cachedTokens: usage?.cachedTokens ?? null,
        totalTokens: usage?.totalTokens ?? null,
        durationMs: durationMs === undefined ? null : Math.round(durationMs),
      },
    });
  }

  async report(user: Principal, query: TokenUsageQuery, all: boolean) {
    if (
      all &&
      (!user.roles.includes('ROLE_ADMIN') ||
        !user.permissions.includes('MANAGE_USERS'))
    )
      throw new ForbiddenException();
    const users = await this.db.user.findMany({
      where: {
        ...(all
          ? {
              OR: [
                {
                  roles: { some: { role: { code: 'ROLE_TEACHER' as const } } },
                },
                { userId: user.userId },
              ],
              ...(query.userId ? { userId: query.userId } : {}),
            }
          : { userId: user.userId }),
        ...(query.search
          ? {
              AND: [
                {
                  OR: [
                    {
                      fullName: {
                        contains: query.search,
                        mode: 'insensitive' as const,
                      },
                    },
                    {
                      email: {
                        contains: query.search,
                        mode: 'insensitive' as const,
                      },
                    },
                  ],
                },
              ],
            }
          : {}),
      },
      select: { userId: true, fullName: true, email: true },
      orderBy: { fullName: 'asc' },
    });
    // Date filters are Vietnamese calendar days, including the whole final day.
    const start = new Date(`${query.from}T00:00:00+07:00`);
    const end = new Date(
      new Date(`${query.to}T00:00:00+07:00`).getTime() + 86400000,
    );
    const where = {
      userId: { in: users.map((u) => u.userId) },
      createdAt: { gte: start, lt: end },
    };
    const [groups, items, count, durations] = await this.db.$transaction([
      this.db.aiTokenUsage.groupBy({
        by: ['userId'],
        where,
        _sum: {
          inputTokens: true,
          outputTokens: true,
          thoughtTokens: true,
          cachedTokens: true,
          totalTokens: true,
        },
        _count: { _all: true, totalTokens: true },
      }),
      this.db.aiTokenUsage.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * 20,
        take: 20,
        include: {
          user: { select: { userId: true, fullName: true, email: true } },
        },
      }),
      this.db.aiTokenUsage.count({ where }),
      this.db.aiTokenUsage.findMany({
        where: { ...where, durationMs: { not: null } },
        select: { durationMs: true, status: true },
        orderBy: { durationMs: 'asc' },
        take: 20000,
      }),
    ]);
    const empty = () => ({
      calls: 0,
      unknownCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      thoughtTokens: 0,
      cachedTokens: 0,
      totalTokens: 0,
    });
    const accounts = users.map((u) => {
      const g = groups.find((g) => g.userId === u.userId);
      return {
        ...u,
        totals: g
          ? {
              calls: g._count._all,
              unknownCalls: g._count._all - g._count.totalTokens,
              inputTokens: g._sum.inputTokens ?? 0,
              outputTokens: g._sum.outputTokens ?? 0,
              thoughtTokens: g._sum.thoughtTokens ?? 0,
              cachedTokens: g._sum.cachedTokens ?? 0,
              totalTokens: g._sum.totalTokens ?? 0,
            }
          : empty(),
      };
    });
    const totals = empty();
    for (const a of accounts)
      for (const key of Object.keys(totals) as (keyof typeof totals)[])
        totals[key] += a.totals[key];
    return {
      totals,
      latency: latencyOf(durations),
      accounts,
      items: items.map((i) => ({ ...i, createdAt: i.createdAt.toISOString() })),
      pagination: {
        page: query.page,
        total: count,
        totalPages: Math.ceil(count / 20),
      },
    };
  }
}
