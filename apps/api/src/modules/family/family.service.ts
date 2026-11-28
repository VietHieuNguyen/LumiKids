import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { ConfigType } from '@nestjs/config';
import {
  SHARING_CONSENT_SCOPE,
  SHARING_CONSENT_VERSION,
} from '@lumikids/shared';
import type {
  CreateFamilyActivityInput,
  CreateFamilyChildInput,
  CreateJoinRequestInput,
  FamilyActivity,
  FamilyChild,
  InvitePreview,
  IssuedLoginCode,
  PlayHistoryPage,
  PlayHistoryQuery,
  UpdateFamilyChildInput,
} from '@lumikids/shared';
import familyConfig from '../../common/config/family.config.js';
import { ApiProblem } from '../../common/http/api-problem.js';
import type { Principal } from '../../common/security/principal.js';
import { ChildAuthService } from '../auth/child-auth.service.js';
import { ClassroomsService } from '../classrooms/classrooms.service.js';
import { TeacherAssessmentsService } from '../classrooms/teacher-assessments.service.js';
import { AssignmentsService } from '../learning-content/assignments.service.js';
import { FamilyRepository } from './family.repository.js';
import type { FamilyChildRow } from './family.repository.js';
import { inviteCodeDigest, normalizeInviteCode } from './invite-code.js';

const toDate = (value: string) => new Date(`${value}T00:00:00.000Z`);

export function familyChild(row: FamilyChildRow, guardianId: string): FamilyChild {
  const enrollment = row.enrollments[0];
  return {
    childId: row.childId,
    fullName: row.fullName,
    dob: row.dob.toISOString().slice(0, 10),
    gender: row.gender,
    status: row.status,
    loginCodeIssuedAt: row.loginCodeIssuedAt?.toISOString() ?? null,
    currentClass: enrollment
      ? {
          classId: enrollment.classroom.classId,
          className: enrollment.classroom.className,
          schoolYearName: enrollment.classroom.schoolYear.name,
          ageGroupName: enrollment.classroom.ageGroup.name,
          viaGuardianConsent:
            enrollment.consent?.guardianId === guardianId &&
            enrollment.consent.revokedAt === null,
          since: enrollment.startedAt.toISOString(),
        }
      : null,
    // Only this guardian's own requests (another guardian of the same child keeps theirs private).
    joinRequests: row.joinRequests
      .filter((request) => request.guardianId === guardianId)
      .map((request) => ({
        requestId: request.requestId,
        childId: row.childId,
        className: request.classroom.className,
        schoolYearName: request.classroom.schoolYear.name,
        status: request.status,
        requestedAt: request.requestedAt.toISOString(),
        decidedAt: request.decidedAt?.toISOString() ?? null,
      })),
  };
}

/** A guardian's own space: their children, family game picks, results and class membership (BR-04/14–16). */
@Injectable()
export class FamilyService {
  now: () => Date = () => new Date();

  constructor(
    private readonly repository: FamilyRepository,
    private readonly classrooms: ClassroomsService,
    private readonly assessments: TeacherAssessmentsService,
    private readonly assignments: AssignmentsService,
    private readonly childAuth: ChildAuthService,
    @Inject(familyConfig.KEY)
    private readonly config: ConfigType<typeof familyConfig>,
    private readonly audit: AuditService,
  ) {}

  private async requireChild(guardian: Principal, childId: string): Promise<FamilyChildRow> {
    const row = await this.repository.findChild(guardian.userId, childId);
    if (!row) throw new ApiProblem('FAMILY_CHILD_NOT_FOUND');
    return row;
  }

  async children(guardian: Principal): Promise<FamilyChild[]> {
    return (await this.repository.listChildren(guardian.userId)).map((row) =>
      familyChild(row, guardian.userId),
    );
  }

  async createChild(guardian: Principal, input: CreateFamilyChildInput): Promise<FamilyChild> {
    const childId = await this.repository.createChild(guardian.userId, {
      fullName: input.fullName,
      dob: toDate(input.dob),
      gender: input.gender,
    });
    return familyChild(await this.requireChild(guardian, childId), guardian.userId);
  }

  async updateChild(
    guardian: Principal,
    childId: string,
    input: UpdateFamilyChildInput,
  ): Promise<FamilyChild> {
    await this.requireChild(guardian, childId);
    await this.repository.updateChild(childId, {
      fullName: input.fullName,
      dob: input.dob ? toDate(input.dob) : undefined,
      gender: input.gender,
    });
    return familyChild(await this.requireChild(guardian, childId), guardian.userId);
  }

  /** At home the guardian gives the child a code; in a class the class teacher does (one code at a time). */
  async issueLoginCode(guardian: Principal, childId: string): Promise<IssuedLoginCode> {
    const child = await this.requireChild(guardian, childId);
    if (child.enrollments.length) throw new ApiProblem('FAMILY_CHILD_CLASS_MANAGED');
    if (child.status !== 'ACTIVE') throw new ApiProblem('CHILD_DISABLED');
    const { code, issuedAt } = await this.childAuth.issueLoginCode(childId);
    await this.audit.record({ actorUserId: guardian.userId, action: 'CHILD_LOGIN_CODE_ISSUED', targetType: 'Child', targetId: childId, detail: { channel: 'GUARDIAN' } });
    return { childId, code, issuedAt: issuedAt.toISOString() };
  }

  async playHistory(
    guardian: Principal,
    childId: string,
    query: PlayHistoryQuery,
  ): Promise<PlayHistoryPage> {
    await this.requireChild(guardian, childId);
    return this.classrooms.childPlayHistory(childId, query);
  }

  /** FR-4.3: the teacher's published notes on the child, for the linked guardian only. */
  async teacherNotes(guardian: Principal, childId: string) {
    await this.requireChild(guardian, childId);
    return this.assessments.listPublished(childId);
  }

  async activities(guardian: Principal, childId: string): Promise<FamilyActivity[]> {
    await this.requireChild(guardian, childId);
    return this.assignments.familyPicks(childId);
  }
  async createActivity(
    guardian: Principal,
    childId: string,
    input: Required<CreateFamilyActivityInput>,
  ): Promise<FamilyActivity> {
    await this.requireChild(guardian, childId);
    return this.assignments.createFamilyPick(guardian, childId, input);
  }
  async cancelActivity(guardian: Principal, childId: string, assignmentId: string) {
    await this.requireChild(guardian, childId);
    await this.assignments.cancelFamilyPick(childId, assignmentId);
  }

  // ---------- Joining a class with an invitation ----------

  private async usableInvite(code: string) {
    const normalized = normalizeInviteCode(code);
    const invite = normalized
      ? await this.repository.findUsableInvite(
          inviteCodeDigest(normalized, this.config.inviteSecret),
          this.now(),
        )
      : null;
    if (!invite || invite.useCount >= invite.maxUses) throw new ApiProblem('INVITE_INVALID');
    return invite;
  }

  async previewInvite(code: string): Promise<InvitePreview> {
    const invite = await this.usableInvite(code);
    return {
      className: invite.classroom.className,
      schoolYearName: invite.classroom.schoolYear.name,
      ageGroupName: invite.classroom.ageGroup.name,
      teacherNames: invite.classroom.teachers.map(({ teacher }) => teacher.fullName),
      expiresAt: invite.expiresAt.toISOString(),
      consentVersion: SHARING_CONSENT_VERSION,
      consentScope: [...SHARING_CONSENT_SCOPE],
    };
  }

  async requestJoin(guardian: Principal, input: CreateJoinRequestInput): Promise<FamilyChild> {
    const child = await this.requireChild(guardian, input.childId);
    if (child.status !== 'ACTIVE') throw new ApiProblem('CHILD_DISABLED');
    if (child.enrollments.length) throw new ApiProblem('CHILD_HAS_CLASS');
    if (!input.consentAccepted || input.consentVersion !== SHARING_CONSENT_VERSION)
      throw new ApiProblem('CONSENT_REQUIRED');
    const invite = await this.usableInvite(input.code);
    if (await this.repository.hasPendingRequest(invite.classId, child.childId))
      throw new ApiProblem('JOIN_REQUEST_PENDING');
    let requestId: string | null;
    try {
      requestId = await this.repository.createJoinRequest({
        inviteId: invite.inviteId,
        classId: invite.classId,
        childId: child.childId,
        guardianId: guardian.userId,
        consentVersion: SHARING_CONSENT_VERSION,
        consentScope: [...SHARING_CONSENT_SCOPE],
        consentedAt: this.now(),
      });
    } catch (error) {
      // The partial unique index: a request raced with this one.
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002')
        throw new ApiProblem('JOIN_REQUEST_PENDING');
      throw error;
    }
    if (!requestId) throw new ApiProblem('INVITE_INVALID');
    return familyChild(await this.requireChild(guardian, child.childId), guardian.userId);
  }

  /** Revokes the consent: the enrollment ends and the class no longer sees the child's data (BR-16). */
  async leaveClass(guardian: Principal, childId: string): Promise<FamilyChild> {
    const child = await this.requireChild(guardian, childId);
    if (!child.enrollments.length) throw new ApiProblem('CHILD_NOT_ENROLLED');
    if (!(await this.repository.leaveClass(guardian.userId, childId, this.now())))
      throw new ApiProblem('NOT_FAMILY_ENROLLMENT');
    return familyChild(await this.requireChild(guardian, childId), guardian.userId);
  }
}
