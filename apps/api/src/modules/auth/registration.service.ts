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
import { MailService } from '../../common/mail/mail.service.js';
import { SlidingWindowLimiter } from '../../common/security/sliding-window-limiter.js';
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
  private readonly perEmail: SlidingWindowLimiter;
  private readonly allMail: SlidingWindowLimiter;

  constructor(
    private readonly repository: RegistrationRepository,
    private readonly passwords: PasswordService,
    private readonly mail: MailService,
    @Inject(verificationConfig.KEY)
    private readonly config: ConfigType<typeof verificationConfig>,
  ) {
    this.perEmail = new SlidingWindowLimiter(config.maxCodesPerEmailPerHour, 3_600_000);
    this.allMail = new SlidingWindowLimiter(config.maxMailsPerHour, 3_600_000);
  }

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

  /**
   * Emails the code. A failed or missing mailer never fails the request (the answer stays the same,
   * so it cannot reveal accounts); the guardian can ask for a new code. Outside production the code
   * is also logged, so registration still works without mail.
   */
  private async deliver(email: string, code: string): Promise<void> {
    if (this.config.logCodes)
      this.logger.log(`Mã xác minh cho ${email}: ${code} (chỉ ghi log ở môi trường phát triển)`);
    if (!this.allMail.take('all')) {
      this.logger.warn('Đã chạm giới hạn email xác minh mỗi giờ của hệ thống: tạm không gửi.');
      return;
    }
    if (!this.mail.enabled) {
      if (!this.config.logCodes)
        this.logger.error('Chưa cấu hình gửi email (EMAIL_USER, EMAIL_PASSWORD): không gửi được mã xác minh.');
      return;
    }
    try {
      await this.mail.send(verificationMail(email, code, this.config.ttlMinutes));
    } catch (error) {
      // No code and no SMTP credentials in the log line.
      this.logger.warn(`Gửi email xác minh thất bại: ${error instanceof Error ? error.name : 'Error'}`);
    }
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
    // A new account's first code counts toward the per-email hourly limit too.
    if (!this.perEmail.take(input.email)) return this.accepted(input.email);
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
    await this.deliver(input.email, code);
    return this.accepted(input.email);
  }

  async resend(email: string): Promise<RegistrationAccepted> {
    const user = await this.repository.findByEmail(email);
    if (!user || user.status !== 'PENDING_VERIFICATION') return this.accepted(email);
    const sentAt = user.verification?.sentAt.getTime() ?? 0;
    if (Date.now() - sentAt < this.config.resendAfterSeconds * 1000)
      throw new ApiProblem('VERIFICATION_TOO_SOON');
    if (!this.perEmail.take(email)) throw new ApiProblem('VERIFICATION_RATE_LIMITED');
    const code = verificationCode();
    await this.repository.replaceCode(user.userId, this.digest(user.userId, code), this.expiry());
    await this.deliver(email, code);
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

/** The verification email: the code large, how long it lasts, and what to do if it was not you. */
export function verificationMail(to: string, code: string, ttlMinutes: number) {
  return {
    to,
    subject: `Mã xác minh LumiKids: ${code}`,
    text: [
      'Xin chào,',
      '',
      `Mã xác minh tài khoản phụ huynh LumiKids của bạn là: ${code}`,
      `Mã có hiệu lực trong ${ttlMinutes} phút.`,
      '',
      'Nếu bạn không đăng ký LumiKids, hãy bỏ qua email này.',
    ].join('\n'),
    html: `<div style="font-family:Arial,sans-serif;color:#20382b;max-width:480px">
<p>Xin chào,</p>
<p>Mã xác minh tài khoản phụ huynh <strong>LumiKids</strong> của bạn là:</p>
<p style="font-size:32px;font-weight:700;letter-spacing:6px;background:#f8f7f0;border:1px solid #dfe2d9;border-radius:12px;padding:16px;text-align:center">${code}</p>
<p>Mã có hiệu lực trong ${ttlMinutes} phút.</p>
<p style="color:#5f6f64;font-size:13px">Nếu bạn không đăng ký LumiKids, hãy bỏ qua email này.</p>
</div>`,
  };
}
