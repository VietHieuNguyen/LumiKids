import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { ageGroupAccepts, ageInMonths, vietnamDate } from '@lumikids/shared';
import type {
  ClassInvite,
  ClassJoinRequest,
  CreateClassInviteInput,
  IssuedClassInvite,
} from '@lumikids/shared';
import familyConfig from '../../common/config/family.config.js';
import { ApiProblem } from '../../common/http/api-problem.js';
import type { Principal } from '../../common/security/principal.js';
import { ClassroomsService } from '../classrooms/classrooms.service.js';
import { FamilyRepository } from './family.repository.js';
import type { InviteRow, JoinRequestRow } from './family.repository.js';
import { generateInviteCode, inviteCodeDigest, normalizeInviteCode } from './invite-code.js';

const DAY_MS = 86_400_000;

function inviteView(row: InviteRow, now: Date): ClassInvite {
  return {
    inviteId: row.inviteId,
    createdByName: row.creator.fullName,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    maxUses: row.maxUses,
    useCount: row.useCount,
    state: row.revokedAt
      ? 'REVOKED'
      : row.expiresAt <= now
        ? 'EXPIRED'
        : row.useCount >= row.maxUses
          ? 'USED_UP'
          : 'ACTIVE',
  };
}

/** A class teacher's invitations and the join requests that come from them (FR-1.8, BR-14/15). */
@Injectable()
export class ClassInvitesService {
  now: () => Date = () => new Date();

  constructor(
    private readonly repository: FamilyRepository,
    private readonly classrooms: ClassroomsService,
    @Inject(familyConfig.KEY)
    private readonly config: ConfigType<typeof familyConfig>,
  ) {}

  async list(teacher: Principal, classId: string): Promise<ClassInvite[]> {
    await this.classrooms.requireTeacherOf(teacher, classId);
    const now = this.now();
    return (await this.repository.listInvites(classId)).map((row) => inviteView(row, now));
  }

  /** The code is in this response only; a lost code is replaced by a new invitation. */
  async create(
    teacher: Principal,
    classId: string,
    input: Required<CreateClassInviteInput>,
  ): Promise<IssuedClassInvite> {
    await this.classrooms.requireTeacherOfActive(teacher, classId);
    const now = this.now();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const code = generateInviteCode();
      const normalized = normalizeInviteCode(code);
      if (!normalized) continue;
      try {
        const row = await this.repository.createInvite({
          classId,
          codeDigest: inviteCodeDigest(normalized, this.config.inviteSecret),
          createdBy: teacher.userId,
          expiresAt: new Date(now.getTime() + input.expiresInDays * DAY_MS),
          maxUses: input.maxUses,
        });
        return { invite: inviteView(row, now), code };
      } catch (error) {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002')
          continue;
        throw error;
      }
    }
    throw new Error('Could not issue a unique invite code.');
  }

  async revoke(teacher: Principal, classId: string, inviteId: string): Promise<ClassInvite> {
    await this.classrooms.requireTeacherOf(teacher, classId);
    if (!(await this.repository.findInvite(classId, inviteId)))
      throw new NotFoundException('Không tìm thấy lời mời.');
    await this.repository.revokeInvite(inviteId, this.now());
    const row = await this.repository.findInvite(classId, inviteId);
    if (!row) throw new NotFoundException('Không tìm thấy lời mời.');
    return inviteView(row, this.now());
  }

  private async view(classId: string, rows: JoinRequestRow[]): Promise<ClassJoinRequest[]> {
    const detail = await this.classrooms.classroom(classId);
    const today = vietnamDate(this.now());
    return rows.map((row) => ({
      requestId: row.requestId,
      childId: row.childId,
      childName: row.child.fullName,
      dob: row.child.dob.toISOString().slice(0, 10),
      gender: row.child.gender,
      guardianName: row.guardian.user.fullName,
      guardianEmail: row.guardian.user.email,
      relationship: row.guardian.relationship,
      status: row.status,
      consentVersion: row.consentVersion,
      requestedAt: row.requestedAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
      ageMatches: ageGroupAccepts(
        detail.ageGroup,
        ageInMonths(row.child.dob.toISOString().slice(0, 10), today),
      ),
    }));
  }

  async joinRequests(teacher: Principal, classId: string): Promise<ClassJoinRequest[]> {
    await this.classrooms.requireTeacherOf(teacher, classId);
    return this.view(classId, await this.repository.listJoinRequests(classId));
  }

  async decide(
    teacher: Principal,
    classId: string,
    requestId: string,
    approve: boolean,
  ): Promise<ClassJoinRequest> {
    await this.classrooms.requireTeacherOfActive(teacher, classId);
    const request = await this.repository.findJoinRequest(classId, requestId);
    if (!request) throw new NotFoundException('Không tìm thấy yêu cầu tham gia.');
    if (request.status !== 'PENDING') throw new ApiProblem('JOIN_REQUEST_DECIDED');
    const now = this.now();
    if (approve) {
      if (request.child.status !== 'ACTIVE') throw new ApiProblem('CHILD_DISABLED');
      const result = await this.repository.approve(request, teacher.userId, now);
      if (result === 'TAKEN') throw new ApiProblem('JOIN_REQUEST_DECIDED');
      if (result === 'HAS_CLASS') throw new ApiProblem('CHILD_HAS_CLASS');
    } else if (!(await this.repository.reject(requestId, teacher.userId, now))) {
      throw new ApiProblem('JOIN_REQUEST_DECIDED');
    }
    const updated = await this.repository.findJoinRequest(classId, requestId);
    if (!updated) throw new NotFoundException('Không tìm thấy yêu cầu tham gia.');
    return (await this.view(classId, [updated]))[0];
  }
}
