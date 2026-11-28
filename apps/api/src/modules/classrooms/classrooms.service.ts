import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { ADMIN_CHILD_ID_LIMIT, sessionPerformanceSchema } from '@lumikids/shared';
import type { CriterionEvaluationView } from '@lumikids/shared';
import type {
  AdminChild,
  AdminChildFilter,
  AdminChildPage,
  AdminChildQuery,
  AgeGroup,
  AgeGroupUsage,
  ReorderAgeGroupsInput,
  SchoolYearUsage,
  UpdateAgeGroupInput,
  ClassGroup,
  CreateClassGroupInput,
  UpdateClassGroupInput,
  ClassroomBatchResult,
  InitialCodesResult,
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
/** Score stored when the session completed; read as-is, never recomputed here. */
function evaluationView(row: {
  performance: unknown;
  evaluation: {
    criterionCode: string;
    score: number | null;
    level: CriterionEvaluationView['level'];
    summary: string | null;
    minimumItemsMet: boolean;
    ruleVersion: string;
    criterion: { description: string };
  } | null;
}): CriterionEvaluationView | null {
  const performance = sessionPerformanceSchema.safeParse(row.performance);
  if (!row.evaluation || !performance.success) return null;
  const { criterion, ...evaluation } = row.evaluation;
  return {
    ...evaluation,
    criterionDescription: criterion.description,
    performance: performance.data.criterionPerformance,
  };
}

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
    private readonly audit: AuditService,
  ) {}

  // ---------- Admin: catalogues ----------

  async ageGroupUsage(): Promise<AgeGroupUsage[]> {
    return (await this.repository.ageGroupUsage()).map((row) => ({
      ...ageGroup(row),
      displayOrder: row.displayOrder,
      classroomCount: row._count.classrooms,
      activeClassroomCount: row.activeClassroomCount,
      activityCount: row._count.activities,
      lessonPlanCount: row._count.lessonPlans,
    }));
  }
  /** Only the display name changes: the age range drives R-01 and the scoring rules. */
  async renameAgeGroup(
    ageGroupId: string,
    input: UpdateAgeGroupInput,
  ): Promise<AgeGroup> {
    if (!(await this.repository.findAgeGroup(ageGroupId)))
      throw new NotFoundException('Không tìm thấy nhóm tuổi.');
    try {
      return ageGroup(
        await this.repository.renameAgeGroup(ageGroupId, input.name),
      );
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ApiProblem('AGE_GROUP_NAME_TAKEN');
      throw error;
    }
  }
  /** The new order must name every age group exactly once. */
  async reorderAgeGroups(
    input: ReorderAgeGroupsInput,
  ): Promise<AgeGroupUsage[]> {
    const current = await this.repository.listAgeGroups();
    const known = new Set(current.map((group) => group.ageGroupId));
    if (
      input.ageGroupIds.length !== known.size ||
      !input.ageGroupIds.every((id) => known.has(id))
    )
      throw new ApiProblem('AGE_GROUP_ORDER_INVALID');
    await this.repository.reorderAgeGroups(input.ageGroupIds);
    return this.ageGroupUsage();
  }
  async schoolYearUsage(): Promise<SchoolYearUsage[]> {
    return (await this.repository.schoolYearUsage()).map((row) => ({
      ...schoolYear(row),
      classroomCount: row.classroomCount,
      activeClassroomCount: row.activeClassroomCount,
      childCount: row.childCount,
    }));
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
    return (await this.repository.listUnassignedChildren()).map((child) => ({
      ...childProfile(child), managedByFamily: child._count.guardians > 0,
    }));
  }
  async pageChildren(query: AdminChildQuery): Promise<AdminChildPage> {
    const { total, rows, counts } = await this.repository.pageChildren(query);
    const items = rows.map((child): AdminChild => {
      const enrollment = child.enrollments[0];
      return {
        ...childProfile(child),
        createdAt: child.createdAt.toISOString(),
        managedByFamily: child._count.guardians > 0,
        currentClass: enrollment
          ? {
              classId: enrollment.classroom.classId,
              className: enrollment.classroom.className,
              schoolYearName: enrollment.classroom.schoolYear.name,
              ageGroupName: enrollment.classroom.ageGroup.name,
              since: enrollment.startedAt.toISOString(),
            }
          : null,
      };
    });
    return { items, total, counts };
  }
  async childIds(filter: AdminChildFilter) {
    const items = await this.repository.childIds(filter, ADMIN_CHILD_ID_LIMIT);
    return { items: items.slice(0, ADMIN_CHILD_ID_LIMIT), truncated: items.length > ADMIN_CHILD_ID_LIMIT };
  }
  /**
   * One target class for many children: unplaced school profiles are placed, children of another class are
   * moved (history kept). Unplaced family profiles are skipped: they join through an invitation.
   */
  async enrollSchoolChildren(classId: string, childIds: readonly string[]): Promise<ClassroomBatchResult> {
    await this.requireActiveClassroom(classId);
    const result: ClassroomBatchResult = { completedIds: [], skipped: [] };
    const now = new Date();
    for (const id of childIds) {
      try {
        const current = await this.repository.findCurrentEnrollment(id);
        if (!current) {
          const status = await this.repository.placeSchoolChild(id, classId, now);
          if (status === 'COMPLETED') result.completedIds.push(id);
          else result.skipped.push({ id, reason: status });
        } else if (current.classId === classId) {
          result.skipped.push({ id, reason: 'SAME_CLASS' });
        } else if (await this.repository.transfer(current, id, classId, now)) {
          result.completedIds.push(id);
        } else {
          result.skipped.push({ id, reason: 'NOT_ELIGIBLE' });
        }
      } catch (error) {
        result.skipped.push({ id, reason: isUniqueViolation(error) ? 'HAS_CLASS' : 'FAILED' });
      }
    }
    return result;
  }
  /** Locks or unlocks child profiles; a locked child is refused on the next request (checked per request). */
  async setChildrenStatus(childIds: readonly string[], status: 'ACTIVE' | 'DISABLED'): Promise<ClassroomBatchResult> {
    const result: ClassroomBatchResult = { completedIds: [], skipped: [] };
    for (const id of childIds) {
      try {
        if (await this.repository.setChildStatus(id, status)) result.completedIds.push(id);
        else if (await this.repository.findChild(id)) result.skipped.push({ id, reason: 'UNCHANGED' });
        else result.skipped.push({ id, reason: 'NOT_ELIGIBLE' });
      } catch {
        result.skipped.push({ id, reason: 'FAILED' });
      }
    }
    return result;
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
      // A family profile joins a class through an invitation, so the guardian confirms the sharing.
      if (await this.repository.countGuardians(childId))
        throw new ApiProblem('CHILD_FAMILY_MANAGED');
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
    return this.childInClass(classId, childId);
  }
  /** No access check: callers authorize first (teacher of the class, or an admin). */
  private async childInClass(classId: string, childId: string) {
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
    await this.requireTeacherOf(teacher, classId);
    return this.classChild(classId, childId);
  }
  /** A child as seen from one class (admin reads any class; teachers go through teacherChild). */
  async classChild(
    classId: string,
    childId: string,
  ): Promise<ClassroomChildDetail> {
    const { child, periods } = await this.childInClass(classId, childId);
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
    await this.requireTeacherOf(teacher, classId);
    return this.classPlayHistory(classId, childId, query);
  }
  /** Sessions started while the child was in this class, with their stored scores. */
  async classPlayHistory(
    classId: string,
    childId: string,
    query: PlayHistoryQuery,
  ): Promise<PlayHistoryPage> {
    const { periods } = await this.childInClass(classId, childId);
    return this.playHistory(childId, periods, query);
  }
  /** Every session of the child (the guardian's view; the family service checks the link first). */
  childPlayHistory(
    childId: string,
    query: PlayHistoryQuery,
  ): Promise<PlayHistoryPage> {
    return this.playHistory(
      childId,
      [{ startedAt: new Date(0), endedAt: null }],
      query,
    );
  }
  private async playHistory(
    childId: string,
    periods: readonly { startedAt: Date; endedAt: Date | null }[],
    query: PlayHistoryQuery,
  ): Promise<PlayHistoryPage> {
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
        // Answers only: hint requests are events too but not attempts.
        attemptCount:
          sessionPerformanceSchema.safeParse(row.performance).data
            ?.attemptCount ?? row.eventCount,
        startedAt: row.startedAt.toISOString(),
        endedAt: row.endedAt?.toISOString() ?? null,
        evaluation: evaluationView(row),
      })),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }
  /** First codes for a class at the start of the year: children that already have a code are skipped, never replaced. */
  async issueInitialCodes(teacher: Principal, classId: string, childIds: readonly string[]): Promise<InitialCodesResult> {
    await this.requireTeacherOfActive(teacher, classId);
    const result: InitialCodesResult = { issued: [], skipped: [] };
    for (const id of childIds) {
      try {
        const issued = await this.childAuth.issueFirstCodeInClass(id, classId, teacher.userId);
        if (issued) {
          result.issued.push({ childId: id, code: issued.code, issuedAt: issued.issuedAt.toISOString() });
          await this.audit.record({ actorUserId: teacher.userId, action: 'CHILD_LOGIN_CODE_ISSUED', targetType: 'Child', targetId: id, detail: { channel: 'CLASS_INITIAL', classId } });
        }
        else result.skipped.push({ id, reason: 'NOT_ELIGIBLE' });
      } catch {
        result.skipped.push({ id, reason: 'FAILED' });
      }
    }
    return result;
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
    await this.audit.record({ actorUserId: teacher.userId, action: 'CHILD_LOGIN_CODE_ISSUED', targetType: 'Child', targetId: childId, detail: { channel: 'CLASS', classId } });
    return { childId, code, issuedAt: issuedAt.toISOString() };
  }
}
