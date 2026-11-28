import type { AuditService } from '../audit/audit.service.js';
import { NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ApiProblem } from '../../common/http/api-problem.js';
import type { Principal } from '../../common/security/principal.js';
import type { PasswordService } from './password.service.js';
import type { AccountStatusRepository } from './account-status.repository.js';
import { temporaryPassword } from './temporary-password.js';
import type { TeacherAccountsRepository } from './teacher-accounts.repository.js';
import { TeacherAccountsService } from './teacher-accounts.service.js';

const problem = (code: string) =>
  expect.objectContaining({ publicCode: code }) as ApiProblem;

function setup() {
  const userId = randomUUID();
  const row = {
    userId,
    fullName: 'Cô Lan',
    email: 'lan@example.test',
    phone: '',
    status: 'ACTIVE' as const,
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    teacherProfile: { specialization: 'Mầm non' },
    authSessions: [],
    classrooms: [],
  };
  const repository = {
    find: vi.fn((id: string) => Promise.resolve(id === userId ? row : null)),
    create: vi.fn(() => Promise.resolve(userId)),
    update: vi.fn(() => Promise.resolve()),
    setPassword: vi.fn(() => Promise.resolve()),
    findPasswordHash: vi.fn(() =>
      Promise.resolve({ passwordHash: 'hash:old' }),
    ),
  };
  const passwords = {
    hash: vi.fn((value: string) => Promise.resolve(`hash:${value}`)),
    verify: vi.fn((value: string, hash?: string) =>
      Promise.resolve(hash === `hash:${value}`),
    ),
  };
  const statuses = {
    setMany: vi.fn(() => Promise.resolve({ updated: [], skipped: [] })),
    activeSessions: vi.fn(() => Promise.resolve(2)),
  };
  const service = new TeacherAccountsService(
    repository as unknown as TeacherAccountsRepository,
    passwords as unknown as PasswordService,
    statuses as unknown as AccountStatusRepository,
    { record: vi.fn(() => Promise.resolve()) } as unknown as AuditService,
  );
  return { service, repository, userId };
}

describe('TeacherAccountsService', () => {
  it('creates a teacher with a one-time temporary password, storing only its hash', async () => {
    const { service, repository } = setup();
    const result = await service.create({
      fullName: 'Cô Lan',
      email: 'lan@example.test',
      phone: '',
      specialization: 'Mầm non',
    });
    expect(result.temporaryPassword).toMatch(
      /^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/,
    );
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        passwordHash: `hash:${result.temporaryPassword}`,
      }),
    );
    expect(JSON.stringify(repository.create.mock.calls)).not.toContain(
      `"${result.temporaryPassword}"`,
    );
  });

  it('reports a taken email as a conflict', async () => {
    const { service, repository } = setup();
    repository.create.mockRejectedValueOnce(
      Object.assign(new Error('unique'), { code: 'P2002' }),
    );
    await expect(
      service.create({
        fullName: 'X',
        email: 'lan@example.test',
        phone: '',
        specialization: '',
      }),
    ).rejects.toEqual(problem('ACCOUNT_EMAIL_TAKEN'));
  });

  it('only manages teacher accounts', async () => {
    const { service } = setup();
    await expect(
      service.update(randomUUID(), { status: 'DISABLED' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.resetPassword(randomUUID())).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('resets a password through the session-revoking write', async () => {
    const { service, repository, userId } = setup();
    const result = await service.resetPassword(userId);
    expect(repository.setPassword).toHaveBeenCalledWith(
      userId,
      `hash:${result.temporaryPassword}`,
    );
  });

  it('changes one’s own password only with the right current password', async () => {
    const { service, repository, userId } = setup();
    const actor = { userId } as Principal;
    await expect(
      service.changeOwnPassword(actor, {
        currentPassword: 'wrong',
        newPassword: 'mot-mat-khau-moi',
      }),
    ).rejects.toEqual(problem('PASSWORD_CURRENT_INVALID'));
    expect(repository.setPassword).not.toHaveBeenCalled();
    await service.changeOwnPassword(actor, {
      currentPassword: 'old',
      newPassword: 'mot-mat-khau-moi',
    });
    expect(repository.setPassword).toHaveBeenCalledWith(
      userId,
      'hash:mot-mat-khau-moi',
    );
  });

  it('temporary passwords avoid look-alike characters', () => {
    for (let index = 0; index < 200; index += 1)
      expect(temporaryPassword()).not.toMatch(/[01OIl]/);
  });
});
