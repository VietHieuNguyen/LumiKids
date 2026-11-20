import { RegistrationService, verificationMail } from './registration.service.js';
import type { RegistrationRepository } from './registration.repository.js';
import type { PasswordService } from './password.service.js';
import type { MailService } from '../../common/mail/mail.service.js';

const config = { codeSecret: 'a'.repeat(64), ttlMinutes: 15, maxAttempts: 5, resendAfterSeconds: 60, maxCodesPerEmailPerHour: 5, maxMailsPerHour: 100, logCodes: false };
const input = { fullName: 'Phụ huynh', email: 'parent@example.test', phone: '', relationship: 'MOTHER' as const, password: 'a-long-password' };

function setup(mail: Partial<MailService>, logCodes = false, limits: Partial<typeof config> = {}) {
  const repository = {
    findByEmail: vi.fn().mockResolvedValue(null),
    createGuardian: vi.fn().mockResolvedValue(undefined),
    replaceCode: vi.fn().mockResolvedValue(undefined),
  };
  const passwords = { hash: vi.fn().mockResolvedValue('hash') };
  const service = new RegistrationService(
    repository as unknown as RegistrationRepository,
    passwords as unknown as PasswordService,
    mail as MailService,
    { ...config, ...limits, logCodes } as never,
  );
  return { service, repository };
}

describe('email verification delivery', () => {
  it('emails the stored code when mail is configured', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const { service, repository } = setup({ enabled: true, send });
    await expect(service.register(input)).resolves.toMatchObject({ email: input.email, expiresInMinutes: 15 });
    expect(send).toHaveBeenCalledTimes(1);
    const mail = send.mock.calls[0][0];
    expect(mail.to).toBe(input.email);
    const code = /(\d{6})/.exec(mail.subject)?.[1];
    expect(code).toBeDefined();
    expect(mail.text).toContain(code);
    expect(repository.createGuardian.mock.calls[0][0].codeDigest).not.toContain(code);
  });
  it('still accepts the registration when sending fails (same answer, guardian can resend)', async () => {
    const send = vi.fn().mockRejectedValue(new Error('smtp down'));
    const { service } = setup({ enabled: true, send });
    await expect(service.register(input)).resolves.toMatchObject({ email: input.email });
  });
  it('does not try to send when mail is not configured', async () => {
    const send = vi.fn();
    const { service } = setup({ enabled: false, send }, true);
    await service.register(input);
    expect(send).not.toHaveBeenCalled();
  });
  it('builds a mail with the code and its lifetime, without other secrets', () => {
    const mail = verificationMail('a@example.test', '123456', 15);
    expect(mail.subject).toContain('123456');
    expect(mail.html).toContain('15 phút');
    expect(mail.text).not.toContain('password');
  });
});

describe('verification rate limits', () => {
  const pending = (minutesAgo: number) => ({
    userId: '00000000-0000-4000-8000-000000000001',
    status: 'PENDING_VERIFICATION',
    verification: { sentAt: new Date(Date.now() - minutesAgo * 60_000) },
  });
  it('caps the codes one email can receive per hour, whatever the IP', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const { service, repository } = setup({ enabled: true, send }, false, { maxCodesPerEmailPerHour: 2 });
    repository.findByEmail.mockResolvedValue(pending(5));
    await service.resend(input.email);
    await service.resend(input.email);
    await expect(service.resend(input.email)).rejects.toMatchObject({ publicCode: 'VERIFICATION_RATE_LIMITED' });
    expect(send).toHaveBeenCalledTimes(2);
    expect(repository.replaceCode).toHaveBeenCalledTimes(2);
  });
  it('stops sending once the hourly mail budget of the process is used', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const { service } = setup({ enabled: true, send }, false, { maxMailsPerHour: 1 });
    await service.register(input);
    await service.register({ ...input, email: 'other@example.test' });
    expect(send).toHaveBeenCalledTimes(1);
  });
});
