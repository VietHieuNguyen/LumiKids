import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateTeacherAssessmentInput,
  TeacherAssessment,
  TeacherAssessmentDetail,
  UpdateTeacherAssessmentInput,
} from '@lumikids/shared';
import { ApiProblem } from '../../common/http/api-problem.js';
import type { Principal } from '../../common/security/principal.js';
import { ClassroomsRepository } from './classrooms.repository.js';
import { ClassroomsService } from './classrooms.service.js';
import {
  TeacherAssessmentsRepository,
  type AssessmentRow,
  type AssessmentSnapshot,
} from './teacher-assessments.repository.js';

const NOT_FOUND = 'Không tìm thấy nhận xét.';

const iso = (value: Date) => value.toISOString().slice(0, 10);

function view(row: AssessmentRow): TeacherAssessment {
  return {
    assessmentId: row.assessmentId,
    childId: row.childId,
    classId: row.classId,
    authorId: row.authorId,
    authorName: row.author.fullName,
    criterionCode: row.criterionCode,
    periodStart: iso(row.periodStart),
    periodEnd: iso(row.periodEnd),
    content: row.content,
    status: row.status,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    revisionCount: row._count.revisions,
  };
}

/**
 * FR-3.1 for teachers. Only a teacher of the class where the child is enrolled now may read or write the
 * child's notes (BR-03). Anything else answers 404, so a note's existence is not revealed.
 */
@Injectable()
export class TeacherAssessmentsService {
  constructor(
    private readonly repository: TeacherAssessmentsRepository,
    private readonly classrooms: ClassroomsService,
    private readonly enrollments: ClassroomsRepository,
  ) {}

  private async requireChildInClass(teacher: Principal, classId: string, childId: string) {
    await this.classrooms.requireTeacherOf(teacher, classId);
    const enrollment = await this.enrollments.findCurrentEnrollment(childId);
    if (!enrollment || enrollment.classId !== classId) throw new NotFoundException(NOT_FOUND);
  }

  private async requireNote(childId: string, assessmentId: string) {
    const row = await this.repository.find(childId, assessmentId);
    if (!row) throw new NotFoundException(NOT_FOUND);
    return row;
  }

  async list(teacher: Principal, classId: string, childId: string): Promise<TeacherAssessment[]> {
    await this.requireChildInClass(teacher, classId, childId);
    return (await this.repository.list(childId)).map(view);
  }

  async detail(
    teacher: Principal,
    classId: string,
    childId: string,
    assessmentId: string,
  ): Promise<TeacherAssessmentDetail> {
    await this.requireChildInClass(teacher, classId, childId);
    const row = await this.requireNote(childId, assessmentId);
    const revisions = await this.repository.revisions(assessmentId);
    return {
      ...view(row),
      revisions: revisions.map((revision) => ({
        revisionNo: revision.revisionNo,
        changedAt: revision.changedAt.toISOString(),
        changedByName: revision.changedByName,
        reason: revision.reason,
        previous: {
          criterionCode: revision.previous.criterionCode,
          periodStart: String(revision.previous.periodStart).slice(0, 10),
          periodEnd: String(revision.previous.periodEnd).slice(0, 10),
          content: revision.previous.content,
          status: revision.previous.status,
        },
      })),
    };
  }

  async create(
    teacher: Principal,
    classId: string,
    childId: string,
    input: CreateTeacherAssessmentInput,
  ): Promise<TeacherAssessment> {
    await this.requireChildInClass(teacher, classId, childId);
    const row = await this.repository.create({
      childId,
      classId,
      authorId: teacher.userId,
      criterionCode: input.criterionCode,
      periodStart: new Date(`${input.periodStart}T00:00:00.000Z`),
      periodEnd: new Date(`${input.periodEnd}T00:00:00.000Z`),
      content: input.content,
    });
    return view(row);
  }

  /**
   * Any edit keeps the replaced values. A published note needs a reason, since the official note is being
   * changed. Editing a note never changes SkillState or any adaptive decision.
   */
  async update(
    teacher: Principal,
    classId: string,
    childId: string,
    assessmentId: string,
    input: UpdateTeacherAssessmentInput,
  ): Promise<TeacherAssessment> {
    await this.requireChildInClass(teacher, classId, childId);
    const current = await this.requireNote(childId, assessmentId);
    const reason = input.reason ?? null;
    if (current.status === 'PUBLISHED' && !reason) throw new ApiProblem('ASSESSMENT_REASON_REQUIRED');

    const patch: Partial<AssessmentSnapshot> = {};
    if (input.criterionCode !== undefined) patch.criterionCode = input.criterionCode;
    if (input.content !== undefined) patch.content = input.content;
    if (input.periodStart !== undefined) patch.periodStart = new Date(`${input.periodStart}T00:00:00.000Z`);
    if (input.periodEnd !== undefined) patch.periodEnd = new Date(`${input.periodEnd}T00:00:00.000Z`);
    const start = patch.periodStart ?? current.periodStart;
    const end = patch.periodEnd ?? current.periodEnd;
    if (start > end) throw new ApiProblem('ASSESSMENT_PERIOD_INVALID');
    if (Object.keys(patch).length === 0) return view(current);

    const row = await this.repository.update(assessmentId, patch, {
      changedBy: teacher.userId,
      reason,
      previous: {
        criterionCode: current.criterionCode,
        periodStart: current.periodStart,
        periodEnd: current.periodEnd,
        content: current.content,
        status: current.status,
      },
    });
    return view(row);
  }

  /** Publishing makes the note the official one. Only a draft can be published. */
  async publish(
    teacher: Principal,
    classId: string,
    childId: string,
    assessmentId: string,
  ): Promise<TeacherAssessment> {
    await this.requireChildInClass(teacher, classId, childId);
    await this.requireNote(childId, assessmentId);
    if (!(await this.repository.publish(assessmentId, new Date())))
      throw new ApiProblem('ASSESSMENT_NOT_DRAFT');
    return view(await this.requireNote(childId, assessmentId));
  }

  /** Parents see only published notes, never drafts or the edit history (FR-4.3). The caller checks the guardian link. */
  async listPublished(childId: string): Promise<TeacherAssessment[]> {
    return (await this.repository.list(childId))
      .filter((row) => row.status === 'PUBLISHED')
      .map(view);
  }

  /** Only a draft is deleted. A published note stays in the record, so its history is kept. */
  async remove(teacher: Principal, classId: string, childId: string, assessmentId: string) {
    await this.requireChildInClass(teacher, classId, childId);
    const row = await this.requireNote(childId, assessmentId);
    if (row.status !== 'DRAFT') throw new ApiProblem('ASSESSMENT_PUBLISHED_NOT_DELETABLE');
    if (!(await this.repository.deleteDraft(assessmentId)))
      throw new ApiProblem('ASSESSMENT_PUBLISHED_NOT_DELETABLE');
    return { deleted: true };
  }
}
