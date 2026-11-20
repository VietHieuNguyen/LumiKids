import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  GuardianAccount,
  IssuedGuardianPassword,
  UpdateGuardianAccountInput,
} from '@lumikids/shared';
import { ApiProblem } from '../../common/http/api-problem.js';
import { PasswordService } from './password.service.js';
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
  ) {}

  async list(): Promise<GuardianAccount[]> {
    return (await this.repository.list()).map(toGuardianAccount);
  }

  private async require(userId: string): Promise<GuardianAccount> {
    const row = await this.repository.find(userId);
    if (!row) throw new NotFoundException('Không tìm thấy tài khoản phụ huynh.');
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

  async resetPassword(userId: string): Promise<IssuedGuardianPassword> {
    await this.requireVerified(userId);
    const password = temporaryPassword();
    await this.repository.setPassword(userId, await this.passwords.hash(password));
    return { account: await this.require(userId), temporaryPassword: password };
  }
}
