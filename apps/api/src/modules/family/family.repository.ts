import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Gender } from '../../generated/prisma/enums.js';

const familyChildSelect = {
  childId: true,
  fullName: true,
  dob: true,
  gender: true,
  status: true,
  loginCodeIssuedAt: true,
  enrollments: {
    where: { endedAt: null },
    take: 1,
    select: {
      enrollmentId: true,
      startedAt: true,
      consent: { select: { guardianId: true, revokedAt: true } },
      classroom: {
        select: {
          classId: true,
          className: true,
          schoolYear: { select: { name: true } },
          ageGroup: { select: { name: true } },
        },
      },
    },
  },
  joinRequests: {
    orderBy: { requestedAt: 'desc' },
    take: 10,
    select: {
      requestId: true,
      guardianId: true,
      status: true,
      requestedAt: true,
      decidedAt: true,
      classroom: { select: { className: true, schoolYear: { select: { name: true } } } },
    },
  },
} as const satisfies Prisma.ChildSelect;
export type FamilyChildRow = Prisma.ChildGetPayload<{ select: typeof familyChildSelect }>;

const inviteSelect = {
  inviteId: true,
  classId: true,
  createdAt: true,
  expiresAt: true,
  maxUses: true,
  useCount: true,
  revokedAt: true,
  creator: { select: { fullName: true } },
} as const satisfies Prisma.ClassInviteSelect;
export type InviteRow = Prisma.ClassInviteGetPayload<{ select: typeof inviteSelect }>;

const joinRequestSelect = {
  requestId: true,
  childId: true,
  classId: true,
  guardianId: true,
  status: true,
  consentVersion: true,
  consentScope: true,
  consentedAt: true,
  requestedAt: true,
  decidedAt: true,
  child: { select: { fullName: true, dob: true, gender: true, status: true } },
  guardian: {
    select: {
      relationship: true,
      user: { select: { fullName: true, email: true } },
    },
  },
} as const satisfies Prisma.ClassJoinRequestSelect;
export type JoinRequestRow = Prisma.ClassJoinRequestGetPayload<{
  select: typeof joinRequestSelect;
}>;

/** Guardians, their children, class invitations, join requests and sharing consents. */
@Injectable()
export class FamilyRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- Guardian's children ----------

  listChildren(guardianId: string) {
    return this.prisma.child.findMany({
      where: { guardians: { some: { guardianId } } },
      select: familyChildSelect,
      orderBy: { createdAt: 'asc' },
    });
  }
  findChild(guardianId: string, childId: string) {
    return this.prisma.child.findFirst({
      where: { childId, guardians: { some: { guardianId } } },
      select: familyChildSelect,
    });
  }
  async createChild(
    guardianId: string,
    data: { fullName: string; dob: Date; gender: Gender },
  ): Promise<string> {
    const child = await this.prisma.child.create({
      data: { ...data, guardians: { create: { guardianId } } },
      select: { childId: true },
    });
    return child.childId;
  }
  async updateChild(
    childId: string,
    data: { fullName?: string; dob?: Date; gender?: Gender },
  ): Promise<void> {
    await this.prisma.child.update({ where: { childId }, data });
  }

  // ---------- Invitations (teacher) ----------

  createInvite(data: {
    classId: string;
    codeDigest: string;
    createdBy: string;
    expiresAt: Date;
    maxUses: number;
  }) {
    return this.prisma.classInvite.create({ data, select: inviteSelect });
  }
  listInvites(classId: string) {
    return this.prisma.classInvite.findMany({
      where: { classId },
      select: inviteSelect,
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
  }
  findInvite(classId: string, inviteId: string) {
    return this.prisma.classInvite.findFirst({
      where: { classId, inviteId },
      select: inviteSelect,
    });
  }
  async revokeInvite(inviteId: string, now: Date): Promise<void> {
    await this.prisma.classInvite.updateMany({
      where: { inviteId, revokedAt: null },
      data: { revokedAt: now },
    });
  }
  /** An invite that can still be used, with what a guardian may see of its class. */
  findUsableInvite(codeDigest: string, now: Date) {
    return this.prisma.classInvite.findFirst({
      where: { codeDigest, revokedAt: null, expiresAt: { gt: now }, classroom: { status: 'ACTIVE' } },
      select: {
        inviteId: true,
        classId: true,
        expiresAt: true,
        maxUses: true,
        useCount: true,
        classroom: {
          select: {
            className: true,
            schoolYear: { select: { name: true } },
            ageGroup: { select: { name: true, minAge: true, maxAge: true } },
            teachers: { select: { teacher: { select: { fullName: true } } } },
          },
        },
      },
    });
  }

  // ---------- Join requests ----------

  hasPendingRequest(classId: string, childId: string) {
    return this.prisma.classJoinRequest.count({
      where: { classId, childId, status: 'PENDING' },
    });
  }
  /** Uses one slot of the invite in the same transaction; false when it was used up meanwhile. */
  async createJoinRequest(data: {
    inviteId: string;
    classId: string;
    childId: string;
    guardianId: string;
    consentVersion: string;
    consentScope: string[];
    consentedAt: Date;
  }): Promise<string | null> {
    return this.prisma.$transaction(async (tx) => {
      const used = await tx.$executeRaw`
        UPDATE "ClassInvite" SET "useCount" = "useCount" + 1
        WHERE "inviteId" = ${data.inviteId}::uuid AND "useCount" < "maxUses" AND "revokedAt" IS NULL`;
      if (used !== 1) return null;
      const row = await tx.classJoinRequest.create({ data, select: { requestId: true } });
      return row.requestId;
    });
  }
  listJoinRequests(classId: string) {
    return this.prisma.classJoinRequest.findMany({
      where: { classId },
      select: joinRequestSelect,
      orderBy: [{ status: 'asc' }, { requestedAt: 'desc' }],
      take: 100,
    });
  }
  findJoinRequest(classId: string, requestId: string) {
    return this.prisma.classJoinRequest.findFirst({
      where: { classId, requestId },
      select: joinRequestSelect,
    });
  }
  async reject(requestId: string, decidedBy: string, now: Date): Promise<boolean> {
    const result = await this.prisma.classJoinRequest.updateMany({
      where: { requestId, status: 'PENDING' },
      data: { status: 'REJECTED', decidedAt: now, decidedBy },
    });
    return result.count === 1;
  }
  /**
   * Approval: the child is enrolled in the class and the consent the guardian confirmed becomes active,
   * in one transaction. 'TAKEN' when the request was decided meanwhile, 'HAS_CLASS' when the child is
   * already in a class (one class at a time).
   */
  async approve(
    request: JoinRequestRow,
    decidedBy: string,
    now: Date,
  ): Promise<'OK' | 'TAKEN' | 'HAS_CLASS'> {
    return this.prisma.$transaction(async (tx) => {
      const decided = await tx.classJoinRequest.updateMany({
        where: { requestId: request.requestId, status: 'PENDING' },
        data: { status: 'APPROVED', decidedAt: now, decidedBy },
      });
      if (decided.count !== 1) return 'TAKEN';
      const open = await tx.classroomEnrollment.count({
        where: { childId: request.childId, endedAt: null },
      });
      if (open > 0) throw new HasClassSignal();
      const enrollment = await tx.classroomEnrollment.create({
        data: { classId: request.classId, childId: request.childId, startedAt: now },
        select: { enrollmentId: true },
      });
      await tx.sharingConsent.create({
        data: {
          requestId: request.requestId,
          enrollmentId: enrollment.enrollmentId,
          childId: request.childId,
          guardianId: request.guardianId,
          classId: request.classId,
          version: request.consentVersion,
          scope: request.consentScope,
          grantedAt: request.consentedAt,
        },
      });
      return 'OK' as const;
    }).catch((error: unknown) => {
      if (error instanceof HasClassSignal ||
          (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002'))
        return 'HAS_CLASS' as const;
      throw error;
    });
  }

  // ---------- Leaving a class (consent revoked) ----------

  /** Ends the family-linked enrollment and revokes its consent; false when there is none to end. */
  async leaveClass(guardianId: string, childId: string, now: Date): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const enrollment = await tx.classroomEnrollment.findFirst({
        where: { childId, endedAt: null, consent: { guardianId, revokedAt: null } },
        select: { enrollmentId: true, startedAt: true, consent: { select: { consentId: true } } },
      });
      if (!enrollment?.consent) return false;
      const endedAt = new Date(Math.max(now.getTime(), enrollment.startedAt.getTime() + 1));
      await tx.classroomEnrollment.update({
        where: { enrollmentId: enrollment.enrollmentId },
        data: { endedAt },
      });
      await tx.sharingConsent.update({
        where: { consentId: enrollment.consent.consentId },
        data: { revokedAt: now },
      });
      // Group lists show current children only, so memberships need no clean-up (same as a transfer).
      return true;
    });
  }
}

class HasClassSignal extends Error {}
