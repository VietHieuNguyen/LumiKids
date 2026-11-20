import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import type {
  RegisterGuardianInput,
  RegistrationAccepted,
  VerifyEmailInput,
} from '@lumikids/shared';
import verificationConfig from '../../common/config/verification.config.js';
import { ApiProblem } from '../../common/http/api-problem.js';
import { PasswordService } from './password.service.js';
import { RegistrationRepository } from './registration.repository.js';

export function verificationCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'P2002'
  );
}

/**
 * Guardian sign-up (FR-1.6): the account stays PENDING_VERIFICATION until the 6-digit emailed code
 * is entered. Answers never reveal whether an email already has an account.
 */
@Injectable()
export class RegistrationService {
  private readonly logger = new Logger('EmailVerification');

  constructor(
    private readonly repository: RegistrationRepository,
    private readonly passwords: PasswordService,
    @Inject(verificationConfig.KEY)
    private readonly config: ConfigType<typeof verificationConfig>,
  ) {}

  private digest(userId: string, code: string): string {
    // Bound to the account so a digest cannot be replayed onto another one.
    return createHmac('sha256', this.config.codeSecret)
      .update(`${userId}:${code}`)
      .digest('hex');
  }

  private accepted(email: string): RegistrationAccepted {
    return { email, expiresInMinutes: this.config.ttlMinutes };
  }

  private expiry(): Date {
    return new Date(Date.now() + this.config.ttlMinutes * 60_000);
  }

  /** Stand-in for the mailer: development only. */
  private deliver(email: string, code: string) {
    if (this.config.logCodes)
      this.logger.log(`Mã xác minh cho ${email}: ${code} (chỉ ghi log ở môi trường phát triển)`);
  }

  async register(input: Required<RegisterGuardianInput>): Promise<RegistrationAccepted> {
    const existing = await this.repository.findByEmail(input.email);
    if (existing) {
      // A pending account gets a fresh code; an active one gets nothing (same answer either way).
      if (existing.status === 'PENDING_VERIFICATION')
        await this.resend(input.email).catch(() => undefined);
      return this.accepted(input.email);
    }
    const passwordHash = await this.passwords.hash(input.password);
    const code = verificationCode();
    const userId = randomUUID();
    try {
      await this.repository.createGuardian({
        userId,
        fullName: input.fullName,
        email: input.email,
        phone: input.phone,
        relationship: input.relationship,
        passwordHash,
        codeDigest: this.digest(userId, code),
        expiresAt: this.expiry(),
      });
    } catch (error) {
      if (isUniqueViolation(error)) return this.accepted(input.email);
      throw error;
    }
    this.deliver(input.email, code);
    return this.accepted(input.email);
  }

  async resend(email: string): Promise<RegistrationAccepted> {
    const user = await this.repository.findByEmail(email);
    if (!user || user.status !== 'PENDING_VERIFICATION') return this.accepted(email);
    const sentAt = user.verification?.sentAt.getTime() ?? 0;
    if (Date.now() - sentAt < this.config.resendAfterSeconds * 1000)
      throw new ApiProblem('VERIFICATION_TOO_SOON');
    const code = verificationCode();
    await this.repository.replaceCode(user.userId, this.digest(user.userId, code), this.expiry());
    this.deliver(email, code);
    return this.accepted(email);
  }

  async verify(input: VerifyEmailInput): Promise<void> {
    const user = await this.repository.findByEmail(input.email);
    const pending = user?.status === 'PENDING_VERIFICATION' ? user.verification : null;
    if (!user || !pending) throw new ApiProblem('VERIFICATION_INVALID');
    if (pending.attempts >= this.config.maxAttempts) throw new ApiProblem('VERIFICATION_LOCKED');
    const expected = Buffer.from(pending.codeDigest, 'hex');
    const actual = Buffer.from(this.digest(user.userId, input.code), 'hex');
    const matches =
      expected.length === actual.length && timingSafeEqual(expected, actual);
    if (!matches || pending.expiresAt.getTime() <= Date.now()) {
      await this.repository.recordFailure(user.userId);
      throw new ApiProblem('VERIFICATION_INVALID');
    }
    if (!(await this.repository.activate(user.userId, pending.codeDigest)))
      throw new ApiProblem('VERIFICATION_INVALID');
  }
}
