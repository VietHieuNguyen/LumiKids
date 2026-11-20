import { Injectable, NotFoundException } from '@nestjs/common';
import type { AccountProfile, UpdateAccountProfileInput } from '@lumikids/shared';
import { ApiProblem } from '../../common/http/api-problem.js';
import type { Principal } from '../../common/security/principal.js';
import { AccountProfileRepository } from './account-profile.repository.js';

type ProfileRow = NonNullable<Awaited<ReturnType<AccountProfileRepository['find']>>>;

export function toAccountProfile(row: ProfileRow): AccountProfile {
  const roles = row.roles.map(({ role }) => role.code);
  return {
    userId: row.userId,
    fullName: row.fullName,
    email: row.email,
    phone: row.phone,
    roles,
    createdAt: row.createdAt.toISOString(),
    previousLoginAt: row.authSessions[1]?.createdAt.toISOString() ?? null,
    activeSessions: row._count.authSessions,
    teacher: roles.includes('ROLE_TEACHER')
      ? {
          specialization: row.teacherProfile?.specialization ?? '',
          classes: row.classrooms.map(({ classroom }) => ({
            classId: classroom.classId,
            className: classroom.className,
            schoolYearName: classroom.schoolYear.name,
            ageGroupName: classroom.ageGroup.name,
            childCount: classroom._count.enrollments,
          })),
        }
      : null,
    guardian: row.guardianProfile
      ? {
          relationship: row.guardianProfile.relationship,
          children: row.guardianProfile.children.map(({ child }) => ({
            childId: child.childId,
            fullName: child.fullName,
            dob: child.dob.toISOString().slice(0, 10),
            className: child.enrollments[0]?.classroom.className ?? null,
          })),
        }
      : null,
  };
}

/** Any signed-in adult reads and edits their own name, phone and role details (never email or roles). */
@Injectable()
export class AccountProfileService {
  constructor(private readonly repository: AccountProfileRepository) {}

  async get(actor: Principal, now = new Date()): Promise<AccountProfile> {
    const row = await this.repository.find(actor.userId, now);
    if (!row) throw new NotFoundException('Không tìm thấy tài khoản.');
    return toAccountProfile(row);
  }

  async update(actor: Principal, input: UpdateAccountProfileInput): Promise<AccountProfile> {
    const current = await this.get(actor);
    if (
      (input.specialization !== undefined && !current.teacher) ||
      (input.relationship !== undefined && !current.guardian)
    )
      throw new ApiProblem('PROFILE_FIELD_NOT_ALLOWED');
    await this.repository.update(actor.userId, input);
    return this.get(actor);
  }
}
