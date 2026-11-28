import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class SupportAccessRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Only a guardian linked to the child may grant support for it. */
  guardianOwnsChild(guardianId: string, childId: string) {
    return this.prisma.guardianChild.findUnique({
      where: { guardianId_childId: { guardianId, childId } },
      select: { childId: true },
    });
  }

  createGrant(childId: string, guardianId: string, expiresAt: Date) {
    return this.prisma.supportGrant.create({
      data: { childId, guardianId, expiresAt },
      select: grantSelect,
    });
  }

  listGrants(guardianId: string, childId: string) {
    return this.prisma.supportGrant.findMany({
      where: { guardianId, childId },
      orderBy: { grantedAt: 'desc' },
      take: 20,
      select: grantSelect,
    });
  }

  /** Revokes only a grant that is still running; a finished grant is left as it is. */
  async revokeGrant(grantId: string, guardianId: string, childId: string, now: Date) {
    const result = await this.prisma.supportGrant.updateMany({
      where: { grantId, guardianId, childId, revokedAt: null, expiresAt: { gt: now } },
      data: { revokedAt: now },
    });
    return result.count === 1;
  }

  findGrant(grantId: string, guardianId: string, childId: string) {
    return this.prisma.supportGrant.findFirst({
      where: { grantId, guardianId, childId },
      select: grantSelect,
    });
  }

  /** The running grant (if any) that lets support staff see this child right now. */
  activeGrant(childId: string, now: Date) {
    return this.prisma.supportGrant.findFirst({
      where: { childId, revokedAt: null, expiresAt: { gt: now } },
      orderBy: { expiresAt: 'desc' },
      select: grantSelect,
    });
  }

  child(childId: string) {
    return this.prisma.child.findUnique({
      where: { childId },
      select: { childId: true, fullName: true, dob: true, gender: true, status: true },
    });
  }

  /** Recent play of the child, all contexts: support needs the home history that school staff cannot see. */
  sessions(childId: string) {
    return this.prisma.playSession.findMany({
      where: { childId },
      orderBy: { startedAt: 'desc' },
      take: 50,
      select: {
        sessionId: true,
        startedAt: true,
        endedAt: true,
        status: true,
        context: true,
        eventCount: true,
      },
    });
  }
}

export const grantSelect = {
  grantId: true,
  childId: true,
  grantedAt: true,
  expiresAt: true,
  revokedAt: true,
} as const;
