import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AccountStatus } from '../../generated/prisma/enums.js';

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

export type GuardianRow = Prisma.UserGetPayload<{
  select: typeof guardianSelect;
}>;

/** Guardian accounts for the admin. Locking or a new password revokes every open session. */
@Injectable()
export class GuardianAccountsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.user.findMany({
      where: guardianWhere,
      select: guardianSelect,
      orderBy: { createdAt: 'desc' },
    });
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
