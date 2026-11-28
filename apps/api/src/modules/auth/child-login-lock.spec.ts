import { randomUUID } from 'node:crypto';
import type { AuditService } from '../audit/audit.service.js';
import { ChildAuthService } from './child-auth.service.js';
import { generateLoginCode } from './child-login-code.js';
import type { ChildAuthRepository } from './child-auth.repository.js';

const childId = randomUUID();
const adminId = randomUUID();
const now = new Date('2026-11-29T02:00:00.000Z');

function setup(options: { enrolled?: boolean; locked?: boolean; unlockCount?: number }) {
  const repository = {
    hasCurrentEnrollment: vi.fn(() => Promise.resolve(options.enrolled ?? true)),
    activeLoginLock: vi.fn(() => Promise.resolve(options.locked ? { lockId: randomUUID() } : null)),
    createLoginLock: vi.fn(() => Promise.resolve(randomUUID())),
    unlockLoginLock: vi.fn(() => Promise.resolve((options.unlockCount ?? 1) > 0)),
    findByCodeDigest: vi.fn(() => Promise.resolve({ childId, status: 'ACTIVE' })),
    hasCurrentClass: vi.fn(() => Promise.resolve(true)),
  };
  const audit = { record: vi.fn(() => Promise.resolve()) };
  const service = new ChildAuthService(
    repository as unknown as ChildAuthRepository,
    {} as never,
    { codeSecret: 'x'.repeat(32) } as never,
    { codeSecret: 'x'.repeat(32) } as never,
    audit as unknown as AuditService,
  );
  return { service, repository, audit };
}

describe('child sign-in lock (FR-1.5)', () => {
  it('locks a child who is in a class, records the reason and audits it', async () => {
    const { service, repository, audit } = setup({});
    await service.lockLogin(adminId, childId, 'Quên mã, cần kiểm tra', now);
    expect(repository.createLoginLock).toHaveBeenCalledWith(childId, 'Quên mã, cần kiểm tra', adminId, now);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'CHILD_LOGIN_LOCKED', actorUserId: adminId }));
  });

  it('refuses to lock a child who is not in a class', async () => {
    const { service, repository } = setup({ enrolled: false });
    await expect(service.lockLogin(adminId, childId, 'lý do')).rejects.toMatchObject({ publicCode: 'CHILD_NOT_ENROLLED' });
    expect(repository.createLoginLock).not.toHaveBeenCalled();
  });

  it('refuses a second lock while one still runs', async () => {
    const { service, repository } = setup({ locked: true });
    await expect(service.lockLogin(adminId, childId, 'lý do')).rejects.toMatchObject({ publicCode: 'CHILD_LOGIN_ALREADY_LOCKED' });
    expect(repository.createLoginLock).not.toHaveBeenCalled();
  });

  it('blocks sign-in with the code while the lock runs', async () => {
    const { service } = setup({ locked: true });
    await expect(service.login(generateLoginCode())).rejects.toMatchObject({ publicCode: 'CHILD_LOGIN_LOCKED' });
  });

  it('unlocks a running lock, and reports when there is none', async () => {
    const ok = setup({ unlockCount: 1 });
    await ok.service.unlockLogin(adminId, childId, now);
    expect(ok.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'CHILD_LOGIN_UNLOCKED' }));
    const none = setup({ unlockCount: 0 });
    await expect(none.service.unlockLogin(adminId, childId)).rejects.toMatchObject({ publicCode: 'CHILD_LOGIN_NOT_LOCKED' });
  });
});
