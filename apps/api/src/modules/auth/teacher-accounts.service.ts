import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type {
  BulkAccountStatusInput,
  BulkAccountStatusResult,
  TeacherAccountDetail,
  ChangeOwnPasswordInput,
  IssuedPassword,
  TeacherAccount,
  UpdateTeacherAccountInput,
} from '@lumikids/shared';
import { ApiProblem } from '../../common/http/api-problem.js';
import type { Principal } from '../../common/security/principal.js';
import { PasswordService } from './password.service.js';
import { AccountStatusRepository } from './account-status.repository.js';
import { temporaryPassword } from './temporary-password.js';
import { TeacherAccountsRepository } from './teacher-accounts.repository.js';
import type { TeacherRow } from './teacher-accounts.repository.js';

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'P2002'
  );
}

function toAccount(row: TeacherRow): TeacherAccount {
  return {
    userId: row.userId,
    fullName: row.fullName,
    email: row.email,
    phone: row.phone,
    specialization: row.teacherProfile?.specialization ?? '',
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    lastLoginAt: row.authSessions[0]?.createdAt.toISOString() ?? null,
    lockedUntil: row.lockedUntil?.toISOString() ?? null,
    classes: row.classrooms.map(({ classroom }) => ({
      classId: classroom.classId,
      className: classroom.className,
      schoolYearName: classroom.schoolYear.name,
      status: classroom.status,
    })),
  };
}

@Injectable()
export class TeacherAccountsService {
  constructor(
    private readonly repository: TeacherAccountsRepository,
    private readonly passwords: PasswordService,
    private readonly statuses: AccountStatusRepository,
    private readonly audit: AuditService,
  ) {}

  /** The admin's side panel: the account plus its classes, work and open sessions. */
  async detail(userId: string): Promise<TeacherAccountDetail> {
    const account = await this.require(userId);
    const [work, activeSessions] = await Promise.all([
      this.repository.workCounts(userId),
      this.statuses.activeSessions(userId),
    ]);
    return { ...account, ...work, activeSessions };
  }

  /** Deactivate or reactivate many teachers; deactivation signs each one out everywhere. */
  bulkStatus(input: BulkAccountStatusInput): Promise<BulkAccountStatusResult> {
    return this.statuses.setMany('ROLE_TEACHER', input.userIds, input.status);
  }

  async list(): Promise<TeacherAccount[]> {
    return (await this.repository.list()).map(toAccount);
  }

  private async require(userId: string): Promise<TeacherAccount> {
    const row = await this.repository.find(userId);
    if (!row) throw new NotFoundException('Không tìm thấy giáo viên.');
    return toAccount(row);
  }

  /** The temporary password is returned once; only its hash is stored. */
  async create(input: {
    fullName: string;
    email: string;
    phone: string;
    specialization: string;
  }): Promise<IssuedPassword> {
    const password = temporaryPassword();
    let userId: string;
    try {
      userId = await this.repository.create({
        ...input,
        passwordHash: await this.passwords.hash(password),
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ApiProblem('ACCOUNT_EMAIL_TAKEN');
      throw error;
    }
    return { account: await this.require(userId), temporaryPassword: password };
  }

  async update(
    userId: string,
    input: UpdateTeacherAccountInput,
  ): Promise<TeacherAccount> {
    await this.require(userId);
    await this.repository.update(userId, input);
    return this.require(userId);
  }

  /** Forgotten password: a new temporary one, and the teacher is signed out everywhere. */
  /** Clears the 15-minute sign-in lock after repeated wrong passwords (AC-02). */
  async unlock(actorUserId: string, userId: string): Promise<TeacherAccount> {
    await this.require(userId);
    await this.repository.clearLoginLock(userId);
    await this.audit.record({ actorUserId, action: 'ACCOUNT_LOCK_CLEARED', targetType: 'User', targetId: userId });
    return this.require(userId);
  }

  async resetPassword(userId: string): Promise<IssuedPassword> {
    await this.require(userId);
    const password = temporaryPassword();
    await this.repository.setPassword(
      userId,
      await this.passwords.hash(password),
    );
    return { account: await this.require(userId), temporaryPassword: password };
  }

  /** Any adult changes their own password; all their sessions end (the caller signs in again). */
  async changeOwnPassword(
    actor: Principal,
    input: ChangeOwnPasswordInput,
  ): Promise<void> {
    const row = await this.repository.findPasswordHash(actor.userId);
    const valid = await this.passwords.verify(
      input.currentPassword,
      row?.passwordHash,
    );
    if (!valid) throw new ApiProblem('PASSWORD_CURRENT_INVALID');
    await this.repository.setPassword(
      actor.userId,
      await this.passwords.hash(input.newPassword),
    );
  }
}
