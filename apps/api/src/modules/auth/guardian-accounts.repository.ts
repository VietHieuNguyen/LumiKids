import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AccountStatus } from '../../generated/prisma/enums.js';
import type { GuardianFilter, GuardianQuery } from '@lumikids/shared';

const guardianWhere = {
  roles: { some: { role: { code: 'ROLE_GUARDIAN' } } },
} satisfies Prisma.UserWhereInput;

const guardianSelect = {
  userId: true,
  fullName: true,
  email: true,
  phone: true,
  status: true,
  createdAt: true,
  lockedUntil: true,
  guardianProfile: {
    select: {
      relationship: true,
      children: {
        orderBy: { child: { fullName: 'asc' } },
        select: {
          child: {
            select: {
              childId: true,
              fullName: true,
              dob: true,
              enrollments: {
                where: { endedAt: null },
                take: 1,
                select: {
                  classroom: { select: { classId: true, className: true } },
                },
              },
            },
          },
        },
      },
    },
  },
  authSessions: {
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: { createdAt: true },
  },
} as const satisfies Prisma.UserSelect;

function guardianListWhere(filter: GuardianFilter): Prisma.UserWhereInput {
  const and: Prisma.UserWhereInput[] = [guardianWhere];
  for (const word of filter.q.split(/\s+/).filter(Boolean))
    and.push({
      OR: [
        { fullName: { contains: word, mode: 'insensitive' } },
        { email: { contains: word, mode: 'insensitive' } },
        { guardianProfile: { children: { some: { child: { fullName: { contains: word, mode: 'insensitive' } } } } } },
      ],
    });
  if (filter.status) and.push({ status: filter.status });
  if (filter.children === 'NONE') and.push({ OR: [{ guardianProfile: null }, { guardianProfile: { children: { none: {} } } }] });
  if (filter.children === 'UNPLACED')
    and.push({ guardianProfile: { children: { some: { child: { enrollments: { none: { endedAt: null } } } } } } });
  return { AND: and };
}

export type GuardianRow = Prisma.UserGetPayload<{
  select: typeof guardianSelect;
}>;

/** Guardian accounts for the admin. Locking or a new password revokes every open session. */
@Injectable()
export class GuardianAccountsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** One page, filtered and sorted in the database, plus the unfiltered counts for the KPI row. */
  async page(query: GuardianQuery) {
    const where = guardianListWhere(query);
    const orderBy: Prisma.UserOrderByWithRelationInput =
      query.sort === 'name' ? { fullName: query.dir } : { createdAt: query.dir };
    const guardianChild = { guardians: { some: { guardian: { user: guardianWhere } } } } satisfies Prisma.ChildWhereInput;
    const [total, rows, all, active, pending, disabled, children, unplacedChildren] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: guardianSelect,
        orderBy: [orderBy, { userId: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.user.count({ where: guardianWhere }),
      this.prisma.user.count({ where: { ...guardianWhere, status: 'ACTIVE' } }),
      this.prisma.user.count({ where: { ...guardianWhere, status: 'PENDING_VERIFICATION' } }),
      this.prisma.user.count({ where: { ...guardianWhere, status: 'DISABLED' } }),
      this.prisma.child.count({ where: guardianChild }),
      this.prisma.child.count({ where: { ...guardianChild, enrollments: { none: { endedAt: null } } } }),
    ]);
    return { total, rows, counts: { all, active, pending, disabled, children, unplacedChildren } };
  }

  async ids(filter: GuardianFilter, limit: number) {
    const rows = await this.prisma.user.findMany({
      where: guardianListWhere(filter),
      select: { userId: true, fullName: true, status: true },
      orderBy: [{ createdAt: 'desc' }, { userId: 'asc' }],
      take: limit + 1,
    });
    return rows;
  }

  find(userId: string) {
    return this.prisma.user.findFirst({
      where: { userId, ...guardianWhere },
      select: guardianSelect,
    });
  }

  /** Per child of this guardian: current consent, a pending join request, and the last play. */
  childExtras(guardianId: string, childIds: readonly string[]) {
    return this.prisma.child.findMany({
      where: { childId: { in: [...childIds] } },
      select: {
        childId: true,
        enrollments: {
          where: { endedAt: null },
          take: 1,
          select: {
            consent: { select: { grantedAt: true, revokedAt: true } },
          },
        },
        joinRequests: {
          where: { guardianId, status: 'PENDING' },
          orderBy: { requestedAt: 'desc' },
          take: 1,
          select: { classroom: { select: { className: true } } },
        },
        playSessions: {
          orderBy: { startedAt: 'desc' },
          take: 1,
          select: { startedAt: true },
        },
      },
    });
  }

  async setStatus(userId: string, status: AccountStatus): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { userId }, data: { status } });
      if (status === 'DISABLED')
        await tx.authSession.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
    });
  }

  /** Admin unlock: the wrong-password count and lock end are cleared. */
  clearLoginLock(userId: string) {
    return this.prisma.user.update({ where: { userId }, data: { failedLoginCount: 0, lockedUntil: null } });
  }

  async setPassword(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { userId }, data: { passwordHash } });
      await tx.authSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }
}
