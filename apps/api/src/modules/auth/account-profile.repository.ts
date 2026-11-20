import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { GuardianRelationship } from '../../generated/prisma/enums.js';

/** One's own adult account: identity, the role profile and the sign-in sessions. */
@Injectable()
export class AccountProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  find(userId: string, now: Date) {
    return this.prisma.user.findUnique({
      where: { userId },
      select: {
        userId: true,
        fullName: true,
        email: true,
        phone: true,
        createdAt: true,
        roles: { select: { role: { select: { code: true } } } },
        authSessions: {
          orderBy: { createdAt: 'desc' },
          take: 2,
          select: { createdAt: true },
        },
        _count: {
          select: {
            authSessions: { where: { revokedAt: null, expiresAt: { gt: now } } },
          },
        },
        teacherProfile: { select: { specialization: true } },
        classrooms: {
          where: { classroom: { status: 'ACTIVE' } },
          orderBy: { classroom: { className: 'asc' } },
          select: {
            classroom: {
              select: {
                classId: true,
                className: true,
                schoolYear: { select: { name: true } },
                ageGroup: { select: { name: true } },
                _count: { select: { enrollments: { where: { endedAt: null } } } },
              },
            },
          },
        },
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
                      select: { classroom: { select: { className: true } } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  async update(
    userId: string,
    data: {
      fullName?: string;
      phone?: string;
      specialization?: string;
      relationship?: GuardianRelationship;
    },
  ): Promise<void> {
    const { specialization, relationship, ...account } = data;
    await this.prisma.$transaction(async (tx) => {
      if (Object.keys(account).length)
        await tx.user.update({ where: { userId }, data: account });
      if (specialization !== undefined)
        await tx.teacher.upsert({
          where: { userId },
          create: { userId, specialization },
          update: { specialization },
        });
      if (relationship !== undefined)
        await tx.guardian.update({ where: { userId }, data: { relationship } });
    });
  }
}
