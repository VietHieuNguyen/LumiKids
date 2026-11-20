import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { GuardianRelationship } from '../../generated/prisma/enums.js';

/** Guardian self-registration and the pending email verification. */
@Injectable()
export class RegistrationRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      select: { userId: true, status: true, verification: true },
    });
  }

  /** Throws Prisma P2002 when the email already has an account. */
  async createGuardian(data: {
    userId: string;
    fullName: string;
    email: string;
    phone: string;
    relationship: GuardianRelationship;
    passwordHash: string;
    codeDigest: string;
    expiresAt: Date;
  }): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.findUniqueOrThrow({
        where: { code: 'ROLE_GUARDIAN' },
        select: { roleId: true },
      });
      const user = await tx.user.create({
        data: {
          userId: data.userId,
          fullName: data.fullName,
          email: data.email,
          phone: data.phone,
          address: '',
          passwordHash: data.passwordHash,
          status: 'PENDING_VERIFICATION',
          roles: { create: { roleId: role.roleId } },
          guardianProfile: { create: { relationship: data.relationship } },
          verification: {
            create: { codeDigest: data.codeDigest, expiresAt: data.expiresAt },
          },
        },
        select: { userId: true },
      });
      return user.userId;
    });
  }

  async replaceCode(userId: string, codeDigest: string, expiresAt: Date) {
    await this.prisma.emailVerification.upsert({
      where: { userId },
      create: { userId, codeDigest, expiresAt },
      update: { codeDigest, expiresAt, attempts: 0, sentAt: new Date() },
    });
  }

  async recordFailure(userId: string) {
    await this.prisma.emailVerification.update({
      where: { userId },
      data: { attempts: { increment: 1 } },
    });
  }

  /** Activates the account and removes the code; false when someone else already used it. */
  async activate(userId: string, codeDigest: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const removed = await tx.emailVerification.deleteMany({
        where: { userId, codeDigest },
      });
      if (removed.count !== 1) return false;
      await tx.user.update({
        where: { userId },
        data: { status: 'ACTIVE' },
      });
      return true;
    });
  }
}
