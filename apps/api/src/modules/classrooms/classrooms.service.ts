import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  AgeGroup,
  ClassGroup,
  CreateClassGroupInput,
  UpdateClassGroupInput,
  ClassroomChild,
  ClassroomChildDetail,
  ClassroomDetail,
  ClassroomQuery,
  ClassroomSummary,
  ClassroomTeacher,
  CreateChildInput,
  CreateClassroomInput,
  CreateSchoolYearInput,
  IssuedLoginCode,
  PlayHistoryPage,
  PlayHistoryQuery,
  SchoolYear,
  UpdateChildInput,
  UpdateClassroomInput,
  UpdateSchoolYearInput,
} from '@lumikids/shared';
import { ApiProblem } from '../../common/http/api-problem.js';
import type { Principal } from '../../common/security/principal.js';
import { ChildAuthService } from '../auth/child-auth.service.js';
import { ClassroomsRepository } from './classrooms.repository.js';
import type {
  ChildRow,
  ClassroomDetailRow,
  ClassroomSummaryRow,
} from './classrooms.repository.js';

const NOT_FOUND = 'Không tìm thấy lớp học.';
const CHILD_NOT_FOUND = 'Không tìm thấy trẻ trong lớp này.';

/** "YYYY-MM-DD" ↔ a @db.Date value (UTC midnight). */
const toDate = (value: string) => new Date(`${value}T00:00:00.000Z`);
const fromDate = (value: Date) => value.toISOString().slice(0, 10);

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}
function isMissingReference(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'P2003' || error.code === 'P2025')
  );
}

function schoolYear(row: {
  schoolYearId: string;
  name: string;
  startDate: Date;
  endDate: Date;
}): SchoolYear {
  return {
    schoolYearId: row.schoolYearId,
    name: row.name,
    startDate: fromDate(row.startDate),
    endDate: fromDate(row.endDate),
  };
}
function ageGroup(row: AgeGroup & { displayOrder?: number }): AgeGroup {
  return {
    ageGroupId: row.ageGroupId,
    name: row.name,
    minAge: row.minAge,
    maxAge: row.maxAge,
  };
}
function summary(row: ClassroomSummaryRow): ClassroomSummary {
  return {
    classId: row.classId,
    className: row.className,
    status: row.status,
    schoolYear: schoolYear(row.schoolYear),
    ageGroup: ageGroup(row.ageGroup),
    teacherCount: row._count.teachers,
    childCount: row._count.enrollments,
  };
}
function childProfile(row: ChildRow) {
  return {
    childId: row.childId,
    fullName: row.fullName,
    dob: fromDate(row.dob),
    gender: row.gender,
    status: row.status,
    loginCodeIssuedAt: row.loginCodeIssuedAt?.toISOString() ?? null,
  };
}
function detail(row: ClassroomDetailRow): ClassroomDetail {
  return {
    ...summary(row),
    teachers: row.teachers.map(({ teacher }) => teacher),
    children: row.enrollments.map(({ child, startedAt }): ClassroomChild => ({
      ...childProfile(child),
      enrolledAt: startedAt.toISOString(),
    })),
  };
}

@Injectable()
export class ClassroomsService {
  constructor(
    private readonly repository: ClassroomsRepository,
    private readonly childAuth: ChildAuthService,
  ) {}

  // ---------- Admin: catalogues ----------

  async listAgeGroups(): Promise<AgeGroup[]> {
    return (await this.repository.listAgeGroups()).map(ageGroup);
  }
  async listSchoolYears(): Promise<SchoolYear[]> {
    return (await this.repository.listSchoolYears()).map(schoolYear);
  }
  async createSchoolYear(input: CreateSchoolYearInput): Promise<SchoolYear> {
    try {
      return schoolYear(
        await this.repository.createSchoolYear({
          name: input.name,
          startDate: toDate(input.startDate),
          endDate: toDate(input.endDate),
        }),
      );
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ApiProblem('SCHOOL_YEAR_NAME_TAKEN');
      throw error;
    }
  }
  async updateSchoolYear(
    schoolYearId: string,
    input: UpdateSchoolYearInput,
  ): Promise<SchoolYear> {
    const current = await this.repository.findSchoolYear(schoolYearId);
    if (!current) throw new NotFoundException('Không tìm thấy năm học.');
    const startDate = input.startDate
      ? toDate(input.startDate)
      : current.startDate;
    const endDate = input.endDate ? toDate(input.endDate) : current.endDate;
    if (endDate <= startDate)
      throw new ApiProblem('SCHOOL_YEAR_PERIOD_INVALID');
    try {
      return schoolYear(
        await this.repository.updateSchoolYear(schoolYearId, {
          name: input.name,
          startDate,
          endDate,
        }),
      );
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ApiProblem('SCHOOL_YEAR_NAME_TAKEN');
      throw error;
    }
  }
  listTeachers(): Promise<ClassroomTeacher[]> {
    return this.repository.listActiveTeachers();
  }

  // ---------- Admin: classrooms ----------

  async listClassrooms(query: ClassroomQuery): Promise<ClassroomSummary[]> {
    return (await this.repository.listClassrooms(query)).map(summary);
  }
  async classroom(classId: string): Promise<ClassroomDetail> {
    const row = await this.repository.findClassroom(classId);
    if (!row) throw new NotFoundException(NOT_FOUND);
    return detail(row);
  }
  async createClassroom(input: CreateClassroomInput): Promise<ClassroomDetail> {
    if (
      !(await this.repository.findSchoolYear(input.schoolYearId)) ||
      !(await this.repository.findAgeGroup(input.ageGroupId))
    )
      throw new ApiProblem('CLASSROOM_REFERENCE_INVALID');
    try {
      const { classId } = await this.repository.createClassroom(input);
      return this.classroom(classId);
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ApiProblem('CLASSROOM_NAME_TAKEN');
      if (isMissingReference(error))
        throw new ApiProblem('CLASSROOM_REFERENCE_INVALID');
      throw error;
    }
  }
  async updateClassroom(
    classId: string,
    input: UpdateClassroomInput,
  ): Promise<ClassroomDetail> {
    const current = await this.repository.findClassroom(classId);
    if (!current) throw new NotFoundException(NOT_FOUND);
    if (
      input.ageGroupId &&
      !(await this.repository.findAgeGroup(input.ageGroupId))
    )
      throw new ApiProblem('CLASSROOM_REFERENCE_INVALID');
    // Archiving must not strand children: move them to another class first.
    if (
      input.status === 'ARCHIVED' &&
      current.status === 'ACTIVE' &&
      (await this.repository.countCurrentChildren(classId)) > 0
    )
      throw new ApiProblem('CLASSROOM_NOT_EMPTY');
    try {
      await this.repository.updateClassroom(classId, input);
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ApiProblem('CLASSROOM_NAME_TAKEN');
      throw error;
    }
    return this.classroom(classId);
  }
  private async requireActiveClassroom(classId: string) {
    const row = await this.repository.findClassroom(classId);
    if (!row) throw new NotFoundException(NOT_FOUND);
    if (row.status !== 'ACTIVE') throw new ApiProblem('CLASSROOM_ARCHIVED');
    return row;
  }
  async addTeacher(classId: string, userId: string): Promise<ClassroomDetail> {
    await this.requireActiveClassroom(classId);
    if (!(await this.repository.isActiveTeacher(userId)))
      throw new ApiProblem('TEACHER_INVALID');
    await this.repository.addTeacher(classId, userId);
    return this.classroom(classId);
  }
  async removeTeacher(
    classId: string,
    userId: string,
  ): Promise<ClassroomDetail> {
    if (!(await this.repository.findClassroom(classId)))
      throw new NotFoundException(NOT_FOUND);
    await this.repository.removeTeacher(classId, userId);
    return this.classroom(classId);
  }

  // ---------- Admin: children ----------

  async createChild(input: CreateChildInput): Promise<ClassroomDetail> {
    await this.requireActiveClassroom(input.classId);
    await this.repository.createChild(
      {
        fullName: input.fullName,
        dob: toDate(input.dob),
        gender: input.gender,
      },
      input.classId,
      new Date(),
    );
    return this.classroom(input.classId);
  }
  async updateChild(childId: string, input: UpdateChildInput) {
    if (!(await this.repository.findChild(childId)))
      throw new NotFoundException('Không tìm thấy trẻ.');
    await this.repository.updateChild(childId, {
      fullName: input.fullName,
      dob: input.dob ? toDate(input.dob) : undefined,
      gender: input.gender,
      status: input.status,
    });
    const child = await this.repository.findChild(childId);
    if (!child) throw new NotFoundException('Không tìm thấy trẻ.');
    return childProfile(child);
  }
  async listUnassignedChildren() {
    return (await this.repository.listUnassignedChildren()).map(childProfile);
  }
  /**
   * Moves a child to another class, mid-year included; the old period stays in the history. A child without
   * a class (a profile from before classrooms) is simply placed in it.
   */
  async transferChild(
    childId: string,
    classId: string,
  ): Promise<ClassroomDetail> {
    if (!(await this.repository.findChild(childId)))
      throw new NotFoundException('Không tìm thấy trẻ.');
    await this.requireActiveClassroom(classId);
    const current = await this.repository.findCurrentEnrollment(childId);
    if (!current) {
      try {
        await this.repository.enroll(childId, classId, new Date());
      } catch (error) {
        if (isUniqueViolation(error))
          throw new ApiProblem('ENROLLMENT_CHANGED');
        throw error;
      }
      return this.classroom(classId);
    }
    if (current.classId === classId)
      throw new ApiProblem('CHILD_ALREADY_IN_CLASS');
    let moved: boolean;
    try {
      moved = await this.repository.transfer(
        current,
        childId,
        classId,
        new Date(),
      );
    } catch (error) {
      if (isUniqueViolation(error)) throw new ApiProblem('ENROLLMENT_CHANGED');
      throw error;
    }
    if (!moved) throw new ApiProblem('ENROLLMENT_CHANGED');
    return this.classroom(classId);
  }

  // ---------- Teacher ----------

  /** A teacher sees only classes they belong to; anything else is reported as missing. */
  async requireTeacherOf(teacher: Principal, classId: string): Promise<void> {
    if (!(await this.repository.isClassTeacher(classId, teacher.userId)))
      throw new NotFoundException(NOT_FOUND);
  }
  /** Membership plus an ACTIVE class: required for anything that changes a class (groups, assignments). */
  async requireTeacherOfActive(teacher: Principal, classId: string) {
    await this.requireTeacherOf(teacher, classId);
    const row = await this.repository.findClassroom(classId);
    if (!row) throw new NotFoundException(NOT_FOUND);
    if (row.status !== 'ACTIVE') throw new ApiProblem('CLASSROOM_ARCHIVED');
    return { classId: row.classId, className: row.className };
  }

  // ---------- For the assignments module ----------

  currentChildren(classId: string) {
    return this.repository.currentChildren(classId);
  }
  async currentClassId(childId: string): Promise<string | null> {
    return (
      (await this.repository.findCurrentEnrollment(childId))?.classId ?? null
    );
  }
  async childNames(childIds: readonly string[]): Promise<Map<string, string>> {
    const rows = await this.repository.childNames(childIds);
    return new Map(rows.map((row) => [row.childId, row.fullName]));
  }
  /** A group of this class, with its current members only. */
  async group(classId: string, groupId: string): Promise<ClassGroup> {
    const row = await this.repository.findGroup(classId, groupId);
    if (!row) throw new NotFoundException('Không tìm thấy nhóm.');
    return {
      groupId: row.groupId,
      name: row.name,
      childIds: row.members.map((m) => m.childId),
    };
  }

  // ---------- Teacher: groups ----------

  async listGroups(teacher: Principal, classId: string): Promise<ClassGroup[]> {
    await this.requireTeacherOf(teacher, classId);
    return (await this.repository.listGroups(classId)).map((row) => ({
      groupId: row.groupId,
      name: row.name,
      childIds: row.members.map((m) => m.childId),
    }));
  }
  private async requireCurrentChildren(
    classId: string,
    childIds: readonly string[],
  ) {
    const current = new Set(
      (await this.repository.currentChildren(classId)).map((c) => c.childId),
    );
    if (childIds.some((id) => !current.has(id)))
      throw new ApiProblem('GROUP_MEMBERS_INVALID');
  }
  async createGroup(
    teacher: Principal,
    classId: string,
    input: CreateClassGroupInput,
  ): Promise<ClassGroup> {
    await this.requireTeacherOfActive(teacher, classId);
    await this.requireCurrentChildren(classId, input.childIds);
    try {
      const { groupId } = await this.repository.createGroup(
        classId,
        input.name,
        input.childIds,
        teacher.userId,
      );
      return this.group(classId, groupId);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ApiProblem('GROUP_NAME_TAKEN');
      throw error;
    }
  }
  async updateGroup(
    teacher: Principal,
    classId: string,
    groupId: string,
    input: UpdateClassGroupInput,
  ): Promise<ClassGroup> {
    await this.requireTeacherOfActive(teacher, classId);
    await this.group(classId, groupId);
    if (input.childIds)
      await this.requireCurrentChildren(classId, input.childIds);
    try {
      await this.repository.updateGroup(groupId, input);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ApiProblem('GROUP_NAME_TAKEN');
      throw error;
    }
    return this.group(classId, groupId);
  }
  /** Deleting a group never touches assignments already given to it (their recipients are a snapshot). */
  async deleteGroup(
    teacher: Principal,
    classId: string,
    groupId: string,
  ): Promise<void> {
    await this.requireTeacherOfActive(teacher, classId);
    await this.group(classId, groupId);
    await this.repository.deleteGroup(groupId);
  }
  async teacherClassrooms(teacher: Principal): Promise<ClassroomSummary[]> {
    return (
      await this.repository.listClassrooms({ teacherUserId: teacher.userId })
    ).map(summary);
  }
  async teacherClassroom(
    teacher: Principal,
    classId: string,
  ): Promise<ClassroomDetail> {
    await this.requireTeacherOf(teacher, classId);
    return this.classroom(classId);
  }
  /** The child's periods in this class; a child who was never in it does not exist for this teacher. */
  private async requireChildInClass(
    teacher: Principal,
    classId: string,
    childId: string,
  ) {
    await this.requireTeacherOf(teacher, classId);
    const periods = await this.repository.listPeriods(classId, childId);
    const child = periods.length
      ? await this.repository.findChild(childId)
      : null;
    if (!child) throw new NotFoundException(CHILD_NOT_FOUND);
    return { child, periods };
  }
  async teacherChild(
    teacher: Principal,
    classId: string,
    childId: string,
  ): Promise<ClassroomChildDetail> {
    const { child, periods } = await this.requireChildInClass(
      teacher,
      classId,
      childId,
    );
    return {
      ...childProfile(child),
      currentlyEnrolled: periods.some((period) => period.endedAt === null),
      periods: periods.map((period) => ({
        startedAt: period.startedAt.toISOString(),
        endedAt: period.endedAt?.toISOString() ?? null,
      })),
    };
  }
  /** Only sessions started while the child was in this class (a former teacher keeps that window). */
  async teacherPlayHistory(
    teacher: Principal,
    classId: string,
    childId: string,
    query: PlayHistoryQuery,
  ): Promise<PlayHistoryPage> {
    const { periods } = await this.requireChildInClass(
      teacher,
      classId,
      childId,
    );
    const { total, rows } = await this.repository.listPlaySessions(
      childId,
      periods,
      query.page,
      query.pageSize,
    );
    return {
      items: rows.map((row) => ({
        sessionId: row.sessionId,
        versionId: row.versionId,
        gameName: row.version.activity.name,
        gameType: row.version.gameType,
        status: row.status,
        attemptCount: row.eventCount,
        startedAt: row.startedAt.toISOString(),
        endedAt: row.endedAt?.toISOString() ?? null,
      })),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }
  /** Only a teacher of the child's current class may issue a code; the previous code stops working. */
  async issueLoginCode(
    teacher: Principal,
    classId: string,
    childId: string,
  ): Promise<IssuedLoginCode> {
    const { child, periods } = await this.requireChildInClass(
      teacher,
      classId,
      childId,
    );
    if (!periods.some((period) => period.endedAt === null))
      throw new ApiProblem('CHILD_NOT_ENROLLED');
    if (child.status !== 'ACTIVE') throw new ApiProblem('CHILD_DISABLED');
    const classroom = await this.repository.findClassroom(classId);
    if (classroom?.status !== 'ACTIVE')
      throw new ApiProblem('CLASSROOM_ARCHIVED');
    const { code, issuedAt } = await this.childAuth.issueLoginCode(childId);
    return { childId, code, issuedAt: issuedAt.toISOString() };
  }
}
