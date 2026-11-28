import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type {
  BulkAccountStatusInput,
  BulkAccountStatusResult,
  ChildSharing,
  GuardianAccountDetail,
  GuardianAccount,
  GuardianFilter,
  GuardianPage,
  GuardianQuery,
  IssuedGuardianPassword,
  UpdateGuardianAccountInput,
} from '@lumikids/shared';
import { GUARDIAN_ID_LIMIT } from '@lumikids/shared';
import { ApiProblem } from '../../common/http/api-problem.js';
import { PasswordService } from './password.service.js';
import { AccountStatusRepository } from './account-status.repository.js';
import { temporaryPassword } from './temporary-password.js';
import { GuardianAccountsRepository } from './guardian-accounts.repository.js';
import type { GuardianRow } from './guardian-accounts.repository.js';

export function toGuardianAccount(row: GuardianRow): GuardianAccount {
  return {
    userId: row.userId,
    fullName: row.fullName,
    email: row.email,
    phone: row.phone,
    relationship: row.guardianProfile?.relationship ?? 'OTHER',
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    lastLoginAt: row.authSessions[0]?.createdAt.toISOString() ?? null,
    lockedUntil: row.lockedUntil?.toISOString() ?? null,
    children: (row.guardianProfile?.children ?? []).map(({ child }) => ({
      childId: child.childId,
      fullName: child.fullName,
      dob: child.dob.toISOString().slice(0, 10),
      classroom: child.enrollments[0]?.classroom ?? null,
    })),
  };
}

/**
 * Admin view of family accounts. Guardians register and verify by themselves, so the admin
 * never creates one and never activates an unverified account (that would skip the email check).
 */
@Injectable()
export class GuardianAccountsService {
  constructor(
    private readonly repository: GuardianAccountsRepository,
    private readonly passwords: PasswordService,
    private readonly statuses: AccountStatusRepository,
    private readonly audit: AuditService,
  ) {}

  /** The admin's side panel: each child's class, whether play is shared with it, and the last play. */
  async detail(userId: string): Promise<GuardianAccountDetail> {
    const account = await this.require(userId);
    const [extras, activeSessions] = await Promise.all([
      this.repository.childExtras(
        userId,
        account.children.map((child) => child.childId),
      ),
      this.statuses.activeSessions(userId),
    ]);
    const byChild = new Map(extras.map((row) => [row.childId, row]));
    return {
      ...account,
      activeSessions,
      children: account.children.map((child) => {
        const extra = byChild.get(child.childId);
        const consent = extra?.enrollments[0]?.consent;
        const live = consent && !consent.revokedAt ? consent : null;
        const pending = extra?.joinRequests[0]?.classroom.className ?? null;
        const sharing: ChildSharing = child.classroom
          ? live
            ? 'CONSENTED'
            : 'SCHOOL_ENROLLED'
          : pending
            ? 'PENDING_REQUEST'
            : 'HOME';
        return {
          ...child,
          sharing,
          consentGrantedAt: live?.grantedAt.toISOString() ?? null,
          pendingClassName: pending,
          lastPlayedAt: extra?.playSessions[0]?.startedAt.toISOString() ?? null,
        };
      }),
    };
  }

  /** Unverified guardians are skipped (the admin never confirms an email for them). */
  bulkStatus(input: BulkAccountStatusInput): Promise<BulkAccountStatusResult> {
    return this.statuses.setMany('ROLE_GUARDIAN', input.userIds, input.status);
  }

  async page(query: GuardianQuery): Promise<GuardianPage> {
    const { total, rows, counts } = await this.repository.page(query);
    return { items: rows.map(toGuardianAccount), total, counts };
  }

  async ids(filter: GuardianFilter) {
    const items = await this.repository.ids(filter, GUARDIAN_ID_LIMIT);
    return { items: items.slice(0, GUARDIAN_ID_LIMIT), truncated: items.length > GUARDIAN_ID_LIMIT };
  }

  private async require(userId: string): Promise<GuardianAccount> {
    const row = await this.repository.find(userId);
    if (!row)
      throw new NotFoundException('Không tìm thấy tài khoản phụ huynh.');
    return toGuardianAccount(row);
  }

  private async requireVerified(userId: string): Promise<GuardianAccount> {
    const account = await this.require(userId);
    if (account.status === 'PENDING_VERIFICATION')
      throw new ApiProblem('GUARDIAN_NOT_VERIFIED');
    return account;
  }

  async update(
    userId: string,
    input: UpdateGuardianAccountInput,
  ): Promise<GuardianAccount> {
    await this.requireVerified(userId);
    await this.repository.setStatus(userId, input.status);
    return this.require(userId);
  }

  /** Clears the 15-minute sign-in lock after repeated wrong passwords (AC-02). */
  async unlock(actorUserId: string, userId: string): Promise<GuardianAccount> {
    await this.require(userId);
    await this.repository.clearLoginLock(userId);
    await this.audit.record({ actorUserId, action: 'ACCOUNT_LOCK_CLEARED', targetType: 'User', targetId: userId });
    return this.require(userId);
  }

  async resetPassword(userId: string): Promise<IssuedGuardianPassword> {
    await this.requireVerified(userId);
    const password = temporaryPassword();
    await this.repository.setPassword(
      userId,
      await this.passwords.hash(password),
    );
    return { account: await this.require(userId), temporaryPassword: password };
  }
}
