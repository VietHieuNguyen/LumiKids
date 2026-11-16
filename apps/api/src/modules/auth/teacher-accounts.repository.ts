import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AccountStatus } from '../../generated/prisma/enums.js';

const teacherWhere = {
  roles: { some: { role: { code: 'ROLE_TEACHER' } } },
} satisfies Prisma.UserWhereInput;

const teacherSelect = {
  userId: true,
  fullName: true,
  email: true,
  phone: true,
  status: true,
  createdAt: true,
  authSessions: {
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: { createdAt: true },
  },
  classrooms: {
    orderBy: { classroom: { className: 'asc' } },
    select: {
      classroom: {
        select: {
          classId: true,
          className: true,
          status: true,
          schoolYear: { select: { name: true } },
        },
      },
    },
  },
} as const satisfies Prisma.UserSelect;

export type TeacherRow = Prisma.UserGetPayload<{
  select: typeof teacherSelect;
}>;

/** Teacher accounts for the admin. Every write that locks someone out also revokes their sessions. */
@Injectable()
export class TeacherAccountsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.user.findMany({
      where: teacherWhere,
      select: teacherSelect,
      orderBy: { fullName: 'asc' },
    });
  }

  find(userId: string) {
    return this.prisma.user.findFirst({
      where: { userId, ...teacherWhere },
      select: teacherSelect,
    });
  }

  /** Throws Prisma P2002 when the email already has an account (of any role). */
  async create(data: {
    fullName: string;
    email: string;
    phone: string;
    passwordHash: string;
  }): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.findUniqueOrThrow({
        where: { code: 'ROLE_TEACHER' },
        select: { roleId: true },
      });
      const user = await tx.user.create({
        data: {
          ...data,
          address: '',
          status: 'ACTIVE',
          roles: { create: { roleId: role.roleId } },
        },
        select: { userId: true },
      });
      return user.userId;
    });
  }

  async update(
    userId: string,
    data: { fullName?: string; phone?: string; status?: AccountStatus },
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { userId }, data });
      if (data.status === 'DISABLED')
        await tx.authSession.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
    });
  }

  /** New password hash; every open session of the account is revoked in the same transaction. */
  async setPassword(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { userId }, data: { passwordHash } });
      await tx.authSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }

  findPasswordHash(userId: string) {
    return this.prisma.user.findUnique({
      where: { userId },
      select: { passwordHash: true },
    });
  }
}
