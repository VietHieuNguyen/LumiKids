import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { DayRow } from './overview-calendar.js';

const teacherRole = {
  roles: { some: { role: { code: 'ROLE_TEACHER' } } },
} satisfies Prisma.UserWhereInput;

/**
 * Read-only reporting over several modules' tables. A dashboard aggregate is the one place a
 * repository reads outside its module: nothing here writes, and no business rule is decided here.
 */
@Injectable()
export class AdminOverviewRepository {
  constructor(private readonly prisma: PrismaService) {}

  schoolYears() {
    return this.prisma.schoolYear.findMany({
      select: {
        schoolYearId: true,
        name: true,
        startDate: true,
        endDate: true,
      },
    });
  }

  activeClasses(now: Date) {
    return this.prisma.classroom.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { className: 'asc' },
      select: {
        classId: true,
        className: true,
        ageGroup: { select: { name: true } },
        teachers: {
          where: { teacher: { status: 'ACTIVE' } },
          select: { userId: true },
        },
        _count: {
          select: {
            enrollments: { where: { endedAt: null } },
            assignments: {
              where: {
                status: 'ACTIVE',
                opensAt: { lte: now },
                OR: [{ dueAt: null }, { dueAt: { gt: now } }],
              },
            },
          },
        },
      },
    });
  }

  activeTeachers() {
    return this.prisma.user.findMany({
      where: { status: 'ACTIVE', ...teacherRole },
      select: {
        userId: true,
        fullName: true,
        classrooms: {
          where: { classroom: { status: 'ACTIVE' } },
          select: { classId: true },
        },
        authSessions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true },
        },
      },
    });
  }

  libraryGames() {
    return this.prisma.activity.count({ where: { status: 'ACTIVE' } });
  }

  unassignedChildren() {
    return this.prisma.child.count({
      where: { status: 'ACTIVE', enrollments: { none: { endedAt: null } } },
    });
  }

  childrenWithoutCode() {
    return this.prisma.child.count({
      where: {
        status: 'ACTIVE',
        loginCodeIssuedAt: null,
        enrollments: {
          some: { endedAt: null, classroom: { status: 'ACTIVE' } },
        },
      },
    });
  }

  /** Games of open assignments that were archived afterwards: children see them greyed out. */
  archivedGamesInOpenAssignments(now: Date) {
    return this.prisma.activityAssignmentItem.count({
      where: {
        version: { activity: { status: { not: 'ACTIVE' } } },
        assignment: {
          status: 'ACTIVE',
          opensAt: { lte: now },
          OR: [{ dueAt: null }, { dueAt: { gt: now } }],
        },
      },
    });
  }

  pendingReplayRequests() {
    return this.prisma.replayRequest.count({
      where: {
        status: 'PENDING',
        recipient: { assignment: { status: 'ACTIVE' } },
      },
    });
  }

  /** Sessions per school-local day from `fromDay` (inclusive). */
  daily(fromDay: string, timeZone: string) {
    return this.prisma.$queryRaw<DayRow[]>(Prisma.sql`
      SELECT to_char(("startedAt" AT TIME ZONE ${timeZone}), 'YYYY-MM-DD') AS day,
             count(*)::int AS sessions,
             (count(*) FILTER (WHERE status = 'COMPLETED'))::int AS completed,
             count(DISTINCT "childId")::int AS children
      FROM "PlaySession"
      WHERE ("startedAt" AT TIME ZONE ${timeZone})::date >= ${fromDay}::date
      GROUP BY 1`);
  }

  /** Distinct children who played since `fromDay`, overall and per current class. */
  async activeChildren(fromDay: string, timeZone: string) {
    const [total] = await this.prisma.$queryRaw<{ children: number }[]>(
      Prisma.sql`
        SELECT count(DISTINCT "childId")::int AS children FROM "PlaySession"
        WHERE ("startedAt" AT TIME ZONE ${timeZone})::date >= ${fromDay}::date`,
    );
    const perClass = await this.prisma.$queryRaw<
      { classId: string; children: number }[]
    >(Prisma.sql`
      SELECT e."classId" AS "classId", count(DISTINCT p."childId")::int AS children
      FROM "PlaySession" p
      JOIN "ClassroomEnrollment" e ON e."childId" = p."childId" AND e."endedAt" IS NULL
      WHERE (p."startedAt" AT TIME ZONE ${timeZone})::date >= ${fromDay}::date
      GROUP BY 1`);
    return { total: total?.children ?? 0, perClass };
  }
}
