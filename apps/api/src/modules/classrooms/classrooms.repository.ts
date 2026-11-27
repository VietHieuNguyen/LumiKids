import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Gender } from '../../generated/prisma/enums.js';
import type { AdminChildFilter, AdminChildQuery } from '@lumikids/shared';

const summaryInclude = {
  schoolYear: true,
  ageGroup: true,
  _count: {
    select: { teachers: true, enrollments: { where: { endedAt: null } } },
  },
} as const satisfies Prisma.ClassroomInclude;

const childSelect = {
  childId: true,
  fullName: true,
  dob: true,
  gender: true,
  status: true,
  loginCodeIssuedAt: true,
} as const satisfies Prisma.ChildSelect;

const directoryChildSelect = {
  ...childSelect,
  createdAt: true,
  _count: { select: { guardians: true } },
  enrollments: {
    where: { endedAt: null },
    take: 1,
    select: {
      startedAt: true,
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
} as const satisfies Prisma.ChildSelect;

function childDirectoryWhere(filter: AdminChildFilter): Prisma.ChildWhereInput {
  const and: Prisma.ChildWhereInput[] = [];
  for (const word of filter.q.split(/\s+/).filter(Boolean))
    and.push({ fullName: { contains: word, mode: 'insensitive' } });
  if (filter.classId === 'none') and.push({ enrollments: { none: { endedAt: null } } });
  else if (filter.classId) and.push({ enrollments: { some: { endedAt: null, classId: filter.classId } } });
  if (filter.managed === 'FAMILY') and.push({ guardians: { some: {} } });
  if (filter.managed === 'SCHOOL') and.push({ guardians: { none: {} } });
  if (filter.code === 'HAS') and.push({ loginCodeIssuedAt: { not: null } });
  if (filter.code === 'NONE') and.push({ loginCodeIssuedAt: null });
  if (filter.status) and.push({ status: filter.status });
  return { AND: and };
}

const detailInclude = {
  ...summaryInclude,
  teachers: {
    orderBy: { addedAt: 'asc' },
    select: {
      teacher: { select: { userId: true, fullName: true, email: true } },
    },
  },
  enrollments: {
    where: { endedAt: null },
    orderBy: { child: { fullName: 'asc' } },
    select: { startedAt: true, child: { select: childSelect } },
  },
} as const satisfies Prisma.ClassroomInclude;

export type ClassroomSummaryRow = Prisma.ClassroomGetPayload<{
  include: typeof summaryInclude;
}>;
export type ClassroomDetailRow = Prisma.ClassroomGetPayload<{
  include: typeof detailInclude;
}>;
export type ChildRow = Prisma.ChildGetPayload<{ select: typeof childSelect }>;
export interface Period {
  startedAt: Date;
  endedAt: Date | null;
}
export interface ChildProfileData {
  fullName: string;
  dob: Date;
  gender: Gender;
}

@Injectable()
export class ClassroomsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- Catalogues ----------

  listAgeGroups() {
    return this.prisma.ageGroup.findMany({ orderBy: { displayOrder: 'asc' } });
  }
  findAgeGroup(ageGroupId: string) {
    return this.prisma.ageGroup.findUnique({ where: { ageGroupId } });
  }
  listSchoolYears() {
    return this.prisma.schoolYear.findMany({ orderBy: { startDate: 'desc' } });
  }
  /** Age groups with what uses them: classes (all and active), saved games, lesson plans. */
  async ageGroupUsage() {
    const [groups, active] = await Promise.all([
      this.prisma.ageGroup.findMany({
        orderBy: { displayOrder: 'asc' },
        include: {
          _count: {
            select: { classrooms: true, activities: true, lessonPlans: true },
          },
        },
      }),
      this.prisma.classroom.groupBy({
        by: ['ageGroupId'],
        where: { status: 'ACTIVE' },
        _count: { _all: true },
      }),
    ]);
    const activeBy = new Map(
      active.map((row) => [row.ageGroupId, row._count._all]),
    );
    return groups.map((group) => ({
      ...group,
      activeClassroomCount: activeBy.get(group.ageGroupId) ?? 0,
    }));
  }
  renameAgeGroup(ageGroupId: string, name: string) {
    return this.prisma.ageGroup.update({
      where: { ageGroupId },
      data: { name },
    });
  }
  async reorderAgeGroups(ageGroupIds: readonly string[]) {
    await this.prisma.$transaction(
      ageGroupIds.map((ageGroupId, index) =>
        this.prisma.ageGroup.update({
          where: { ageGroupId },
          data: { displayOrder: index + 1 },
        }),
      ),
    );
  }
  /** School years with their classes and the children enrolled in them now. */
  async schoolYearUsage() {
    const [years, classes] = await Promise.all([
      this.prisma.schoolYear.findMany({ orderBy: { startDate: 'desc' } }),
      this.prisma.classroom.findMany({
        select: {
          schoolYearId: true,
          status: true,
          _count: { select: { enrollments: { where: { endedAt: null } } } },
        },
      }),
    ]);
    return years.map((year) => {
      const own = classes.filter(
        (item) => item.schoolYearId === year.schoolYearId,
      );
      return {
        ...year,
        classroomCount: own.length,
        activeClassroomCount: own.filter((item) => item.status === 'ACTIVE')
          .length,
        childCount: own.reduce((sum, item) => sum + item._count.enrollments, 0),
      };
    });
  }
  findSchoolYear(schoolYearId: string) {
    return this.prisma.schoolYear.findUnique({ where: { schoolYearId } });
  }
  createSchoolYear(data: { name: string; startDate: Date; endDate: Date }) {
    return this.prisma.schoolYear.create({ data });
  }
  updateSchoolYear(
    schoolYearId: string,
    data: { name?: string; startDate?: Date; endDate?: Date },
  ) {
    return this.prisma.schoolYear.update({ where: { schoolYearId }, data });
  }

  // ---------- Classrooms ----------

  listClassrooms(filter: {
    schoolYearId?: string;
    status?: 'ACTIVE' | 'ARCHIVED';
    teacherUserId?: string;
  }) {
    return this.prisma.classroom.findMany({
      where: {
        schoolYearId: filter.schoolYearId,
        status: filter.status,
        ...(filter.teacherUserId
          ? { teachers: { some: { userId: filter.teacherUserId } } }
          : {}),
      },
      include: summaryInclude,
      orderBy: [{ schoolYear: { startDate: 'desc' } }, { className: 'asc' }],
    });
  }
  findClassroom(classId: string) {
    return this.prisma.classroom.findUnique({
      where: { classId },
      include: detailInclude,
    });
  }
  createClassroom(data: {
    className: string;
    schoolYearId: string;
    ageGroupId: string;
  }) {
    return this.prisma.classroom.create({ data, select: { classId: true } });
  }
  updateClassroom(
    classId: string,
    data: {
      className?: string;
      ageGroupId?: string;
      status?: 'ACTIVE' | 'ARCHIVED';
    },
  ) {
    return this.prisma.classroom.update({ where: { classId }, data });
  }
  countCurrentChildren(classId: string) {
    return this.prisma.classroomEnrollment.count({
      where: { classId, endedAt: null },
    });
  }

  // ---------- Teachers ----------

  listActiveTeachers() {
    return this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        roles: { some: { role: { code: 'ROLE_TEACHER' } } },
      },
      select: { userId: true, fullName: true, email: true },
      orderBy: { fullName: 'asc' },
    });
  }
  async isActiveTeacher(userId: string): Promise<boolean> {
    const count = await this.prisma.user.count({
      where: {
        userId,
        status: 'ACTIVE',
        roles: { some: { role: { code: 'ROLE_TEACHER' } } },
      },
    });
    return count > 0;
  }
  async isClassTeacher(classId: string, userId: string): Promise<boolean> {
    const row = await this.prisma.classroomTeacher.findUnique({
      where: { classId_userId: { classId, userId } },
      select: { classId: true },
    });
    return row !== null;
  }
  async addTeacher(classId: string, userId: string): Promise<void> {
    await this.prisma.classroomTeacher.createMany({
      data: [{ classId, userId }],
      skipDuplicates: true,
    });
  }
  async removeTeacher(classId: string, userId: string): Promise<void> {
    await this.prisma.classroomTeacher.deleteMany({
      where: { classId, userId },
    });
  }

  // ---------- Children ----------

  findChild(childId: string) {
    return this.prisma.child.findUnique({
      where: { childId },
      select: childSelect,
    });
  }
  /** The child and the first enrollment, with one clock (the API's) for every period boundary. */
  createChild(profile: ChildProfileData, classId: string, now: Date) {
    return this.prisma.child.create({
      data: {
        ...profile,
        enrollments: { create: { classId, startedAt: now } },
      },
      select: { childId: true },
    });
  }
  updateChild(
    childId: string,
    data: Partial<ChildProfileData> & { status?: 'ACTIVE' | 'DISABLED' },
  ) {
    return this.prisma.child.update({ where: { childId }, data });
  }
  /** One page of the admin directory, filtered and sorted in the database. */
  async pageChildren(query: AdminChildQuery) {
    const where = childDirectoryWhere(query);
    const orderBy: Prisma.ChildOrderByWithRelationInput[] =
      query.sort === 'dob'
        ? [{ dob: query.dir }, { fullName: 'asc' }]
        : query.sort === 'createdAt'
          ? [{ createdAt: query.dir }]
          : [{ fullName: query.dir }];
    const [total, rows, all, unassigned, withoutCode, disabled] = await this.prisma.$transaction([
      this.prisma.child.count({ where }),
      this.prisma.child.findMany({
        where,
        orderBy: [...orderBy, { childId: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: directoryChildSelect,
      }),
      this.prisma.child.count(),
      this.prisma.child.count({ where: { enrollments: { none: { endedAt: null } } } }),
      this.prisma.child.count({ where: { status: 'ACTIVE', loginCodeIssuedAt: null } }),
      this.prisma.child.count({ where: { status: 'DISABLED' } }),
    ]);
    return { total, rows, counts: { all, unassigned, withoutCode, disabled } };
  }
  /** Ids matching the directory filters, one more than `limit` to tell when the list was cut. */
  async childIds(filter: AdminChildFilter, limit: number) {
    const rows = await this.prisma.child.findMany({
      where: childDirectoryWhere(filter),
      orderBy: [{ fullName: 'asc' }, { childId: 'asc' }],
      take: limit + 1,
      select: {
        childId: true,
        fullName: true,
        status: true,
        _count: { select: { guardians: true } },
        enrollments: { where: { endedAt: null }, take: 1, select: { classId: true } },
      },
    });
    return rows.map((row) => ({
      childId: row.childId,
      fullName: row.fullName,
      status: row.status,
      classId: row.enrollments[0]?.classId ?? null,
      managedByFamily: row._count.guardians > 0,
    }));
  }
  countGuardians(childId: string) {
    return this.prisma.guardianChild.count({ where: { childId } });
  }
  /** True when the status changed; a child already in that status is left alone. */
  async setChildStatus(childId: string, status: 'ACTIVE' | 'DISABLED') {
    const result = await this.prisma.child.updateMany({
      where: { childId, status: { not: status } },
      data: { status },
    });
    return result.count === 1;
  }
  /** Children with no open enrollment (e.g. profiles created before classrooms existed). */
  listUnassignedChildren() {
    return this.prisma.child.findMany({
      where: { enrollments: { none: { endedAt: null } } },
      orderBy: { fullName: 'asc' },
      select: { ...childSelect, _count: { select: { guardians: true } } },
    });
  }
  /** Opens the first enrollment of a child without a class; the partial unique index refuses a second one. */
  async enroll(childId: string, classId: string, now: Date): Promise<void> {
    await this.prisma.classroomEnrollment.create({
      data: { classId, childId, startedAt: now },
    });
  }
  async placeSchoolChild(childId: string, classId: string, now: Date) {
    return this.prisma.$transaction(async (tx) => {
      const child = await tx.child.findUnique({
        where: { childId },
        select: {
          status: true,
          _count: { select: { guardians: true, enrollments: { where: { endedAt: null } } } },
        },
      });
      if (!child || child.status !== 'ACTIVE') return 'NOT_ELIGIBLE' as const;
      if (child._count.guardians) return 'FAMILY_PROFILE' as const;
      if (child._count.enrollments) return 'HAS_CLASS' as const;
      const target = await tx.classroom.findFirst({ where: { classId, status: 'ACTIVE' }, select: { classId: true } });
      if (!target) return 'NOT_ELIGIBLE' as const;
      await tx.classroomEnrollment.create({ data: { classId, childId, startedAt: now } });
      return 'COMPLETED' as const;
    }, { isolationLevel: 'Serializable' });
  }
  findCurrentEnrollment(childId: string) {
    return this.prisma.classroomEnrollment.findFirst({
      where: { childId, endedAt: null },
      select: { enrollmentId: true, classId: true, startedAt: true },
    });
  }
  /**
   * Closes the open enrollment and opens one in the new class atomically. Returns false when the open
   * enrollment changed meanwhile (a concurrent transfer); the partial unique index guards the rest.
   */
  async transfer(
    current: { enrollmentId: string; startedAt: Date },
    childId: string,
    classId: string,
    now: Date,
  ): Promise<boolean> {
    // A period never ends before (or exactly when) it starts, even for an immediate correction.
    const endedAt = new Date(
      Math.max(now.getTime(), current.startedAt.getTime() + 1),
    );
    return this.prisma.$transaction(async (tx) => {
      const closed = await tx.classroomEnrollment.updateMany({
        where: { enrollmentId: current.enrollmentId, endedAt: null },
        data: { endedAt },
      });
      if (closed.count !== 1) return false;
      await tx.classroomEnrollment.create({
        data: { classId, childId, startedAt: endedAt },
      });
      return true;
    });
  }
  /** Every period the child spent in this class, oldest first. */
  /**
   * The child's periods in a class. A period opened through a guardian's consent that was later revoked
   * is left out: the class no longer sees that child's data (BR-16).
   */
  listPeriods(classId: string, childId: string): Promise<Period[]> {
    return this.prisma.classroomEnrollment.findMany({
      where: {
        classId,
        childId,
        OR: [{ consent: null }, { consent: { revokedAt: null } }],
      },
      orderBy: { startedAt: 'asc' },
      select: { startedAt: true, endedAt: true },
    });
  }

  // ---------- For other modules (assignments) ----------

  /** Children currently enrolled in the class. */
  async currentChildren(classId: string) {
    const rows = await this.prisma.classroomEnrollment.findMany({
      where: { classId, endedAt: null },
      orderBy: { child: { fullName: 'asc' } },
      select: {
        child: { select: { childId: true, fullName: true, status: true } },
      },
    });
    return rows.map((row) => row.child);
  }
  childNames(childIds: readonly string[]) {
    return this.prisma.child.findMany({
      where: { childId: { in: [...childIds] } },
      select: { childId: true, fullName: true },
    });
  }

  // ---------- Groups ----------

  listGroups(classId: string) {
    return this.prisma.classGroup.findMany({
      where: { classId },
      orderBy: { name: 'asc' },
      select: {
        groupId: true,
        name: true,
        members: {
          where: {
            child: { enrollments: { some: { classId, endedAt: null } } },
          },
          select: { childId: true },
        },
      },
    });
  }
  findGroup(classId: string, groupId: string) {
    return this.prisma.classGroup.findFirst({
      where: { classId, groupId },
      select: {
        groupId: true,
        name: true,
        members: {
          where: {
            child: { enrollments: { some: { classId, endedAt: null } } },
          },
          select: { childId: true },
        },
      },
    });
  }
  createGroup(
    classId: string,
    name: string,
    childIds: readonly string[],
    createdBy: string,
  ) {
    return this.prisma.classGroup.create({
      data: {
        classId,
        name,
        createdBy,
        members: { create: childIds.map((childId) => ({ childId })) },
      },
      select: { groupId: true },
    });
  }
  /** Renames and/or replaces the member list in one transaction. */
  async updateGroup(
    groupId: string,
    data: { name?: string; childIds?: readonly string[] },
  ) {
    await this.prisma.$transaction(async (tx) => {
      if (data.name !== undefined)
        await tx.classGroup.update({
          where: { groupId },
          data: { name: data.name },
        });
      if (data.childIds) {
        await tx.classGroupMember.deleteMany({ where: { groupId } });
        await tx.classGroupMember.createMany({
          data: data.childIds.map((childId) => ({ groupId, childId })),
        });
      }
    });
  }
  async deleteGroup(groupId: string): Promise<void> {
    await this.prisma.classGroup.delete({ where: { groupId } });
  }

  // ---------- Play history ----------

  async listPlaySessions(
    childId: string,
    periods: readonly Period[],
    page: number,
    pageSize: number,
  ) {
    const where: Prisma.PlaySessionWhereInput = {
      childId,
      // Home practice stays with the family; legacy sessions have no context.
      AND: [{ OR: [{ context: null }, { context: 'SCHOOL' }] }],
      OR: periods.map((period) => ({
        startedAt: {
          gte: period.startedAt,
          ...(period.endedAt ? { lt: period.endedAt } : {}),
        },
      })),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.playSession.count({ where }),
      this.prisma.playSession.findMany({
        where,
        orderBy: [{ startedAt: 'desc' }, { sessionId: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          sessionId: true,
          versionId: true,
          status: true,
          eventCount: true,
          startedAt: true,
          endedAt: true,
          performance: true,
          evaluation: {
            select: {
              criterionCode: true,
              score: true,
              level: true,
              summary: true,
              minimumItemsMet: true,
              ruleVersion: true,
              criterion: { select: { description: true } },
            },
          },
          version: {
            select: { gameType: true, activity: { select: { name: true } } },
          },
        },
      }),
    ]);
    return { total, rows };
  }
}
