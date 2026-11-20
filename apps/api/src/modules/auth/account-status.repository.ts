import { Injectable } from '@nestjs/common';
import type { BulkAccountStatusResult } from '@lumikids/shared';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { RoleCode } from '../../generated/prisma/enums.js';

type SettableStatus = 'ACTIVE' | 'DISABLED';

/**
 * Deactivates or reactivates many accounts of one role in a single transaction. Deactivation
 * revokes every open session of those accounts in the same transaction. Accounts of another role,
 * guardians still waiting for email verification and accounts already in the status are skipped.
 */
@Injectable()
export class AccountStatusRepository {
  constructor(private readonly prisma: PrismaService) {}

  setMany(
    role: RoleCode,
    userIds: readonly string[],
    status: SettableStatus,
  ): Promise<BulkAccountStatusResult> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.user.findMany({
        where: {
          userId: { in: [...userIds] },
          roles: { some: { role: { code: role } } },
        },
        select: { userId: true, status: true },
      });
      const found = new Map(rows.map((row) => [row.userId, row.status]));
      const updated: string[] = [];
      const skipped: BulkAccountStatusResult['skipped'] = [];
      for (const userId of userIds) {
        const current = found.get(userId);
        if (!current) skipped.push({ userId, reason: 'NOT_FOUND' });
        else if (current === 'PENDING_VERIFICATION')
          skipped.push({ userId, reason: 'PENDING_VERIFICATION' });
        else if (current === status)
          skipped.push({ userId, reason: 'UNCHANGED' });
        else updated.push(userId);
      }
      if (updated.length > 0) {
        await tx.user.updateMany({
          // Re-checked here: verification never gets skipped by a bulk change.
          where: {
            userId: { in: updated },
            status: { not: 'PENDING_VERIFICATION' },
          },
          data: { status },
        });
        if (status === 'DISABLED')
          await tx.authSession.updateMany({
            where: { userId: { in: updated }, revokedAt: null },
            data: { revokedAt: new Date() },
          });
      }
      return { updated, skipped };
    });
  }

  /** Devices signed in now: sessions neither revoked nor expired. */
  activeSessions(userId: string): Promise<number> {
    return this.prisma.authSession.count({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    });
  }
}
