import type { AuditService } from '../audit/audit.service.js';
import { guardianQuerySchema } from '@lumikids/shared';
import { randomUUID } from 'node:crypto';
import type { ApiProblem } from '../../common/http/api-problem.js';
import type { PasswordService } from './password.service.js';
import type { AccountStatusRepository } from './account-status.repository.js';
import type { GuardianAccountsRepository } from './guardian-accounts.repository.js';
import { GuardianAccountsService } from './guardian-accounts.service.js';

const problem = (code: string) =>
  expect.objectContaining({ publicCode: code }) as ApiProblem;

function setup(
  status: 'ACTIVE' | 'DISABLED' | 'PENDING_VERIFICATION' = 'ACTIVE',
) {
  const userId = randomUUID();
  const classId = randomUUID();
  const row = {
    userId,
    fullName: 'Nguyễn Thị Lan',
    email: 'lan@example.test',
    phone: '',
    status,
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    authSessions: [],
    guardianProfile: {
      relationship: 'MOTHER' as const,
      children: [
        {
          child: {
            childId: randomUUID(),
            fullName: 'Bé An',
            dob: new Date('2021-05-02T00:00:00.000Z'),
            enrollments: [{ classroom: { classId, className: 'Lá 1' } }],
          },
        },
        {
          child: {
            childId: randomUUID(),
            fullName: 'Bé Bình',
            dob: new Date('2022-01-10T00:00:00.000Z'),
            enrollments: [],
          },
        },
      ],
    },
  };
  const repository = {
    page: vi.fn(() => Promise.resolve({ total: 1, rows: [row], counts: { all: 1, active: 1, pending: 0, disabled: 0, children: 2, unplacedChildren: 1 } })),
    find: vi.fn((id: string) => Promise.resolve(id === userId ? row : null)),
    setStatus: vi.fn(() => Promise.resolve()),
    setPassword: vi.fn(() => Promise.resolve()),
    childExtras: vi.fn(() =>
      Promise.resolve([
        {
          childId: row.guardianProfile.children[0].child.childId,
          enrollments: [
            {
              consent: {
                grantedAt: new Date('2026-11-02T00:00:00.000Z'),
                revokedAt: null,
              },
            },
          ],
          joinRequests: [],
          playSessions: [{ startedAt: new Date('2026-11-19T08:00:00.000Z') }],
        },
        {
          childId: row.guardianProfile.children[1].child.childId,
          enrollments: [],
          joinRequests: [{ classroom: { className: 'Chồi 2' } }],
          playSessions: [],
        },
      ]),
    ),
  };
  const passwords = {
    hash: vi.fn((value: string) => Promise.resolve(`hash:${value}`)),
  };
  const statuses = {
    setMany: vi.fn(() => Promise.resolve({ updated: [], skipped: [] })),
    activeSessions: vi.fn(() => Promise.resolve(2)),
  };
  const service = new GuardianAccountsService(
    repository as unknown as GuardianAccountsRepository,
    passwords as unknown as PasswordService,
    statuses as unknown as AccountStatusRepository,
    { record: vi.fn(() => Promise.resolve()) } as unknown as AuditService,
  );
  return { service, repository, userId, classId };
}

describe('GuardianAccountsService', () => {
  it('lists guardians with their children and the class each child is in now', async () => {
    const { service, classId } = setup();
    const page = await service.page(guardianQuerySchema.parse({}));
    expect(page.total).toBe(1);
    const [account] = page.items;
    expect(account.relationship).toBe('MOTHER');
    expect(
      account.children.map((child) => [
        child.fullName,
        child.dob,
        child.classroom?.classId ?? null,
      ]),
    ).toEqual([
      ['Bé An', '2021-05-02', classId],
      ['Bé Bình', '2022-01-10', null],
    ]);
  });

  it('locks a verified guardian', async () => {
    const { service, repository, userId } = setup();
    await service.update(userId, { status: 'DISABLED' });
    expect(repository.setStatus).toHaveBeenCalledWith(userId, 'DISABLED');
  });

  it('never activates or resets an account still waiting for email verification', async () => {
    const { service, repository, userId } = setup('PENDING_VERIFICATION');
    await expect(service.update(userId, { status: 'ACTIVE' })).rejects.toEqual(
      problem('GUARDIAN_NOT_VERIFIED'),
    );
    await expect(service.resetPassword(userId)).rejects.toEqual(
      problem('GUARDIAN_NOT_VERIFIED'),
    );
    expect(repository.setStatus).not.toHaveBeenCalled();
    expect(repository.setPassword).not.toHaveBeenCalled();
  });

  it('resets the password to a one-time temporary one, storing only its hash', async () => {
    const { service, repository, userId } = setup('DISABLED');
    const result = await service.resetPassword(userId);
    expect(repository.setPassword).toHaveBeenCalledWith(
      userId,
      `hash:${result.temporaryPassword}`,
    );
  });

  it('answers 404 for a user who is not a guardian', async () => {
    const { service } = setup();
    await expect(
      service.update(randomUUID(), { status: 'DISABLED' }),
    ).rejects.toThrow('Không tìm thấy');
  });

  it('shows, per child, whether play is shared with the class and when the child last played', async () => {
    const { service, userId } = setup();
    const detail = await service.detail(userId);
    expect(detail.activeSessions).toBe(2);
    expect(
      detail.children.map((child) => [
        child.sharing,
        child.consentGrantedAt,
        child.pendingClassName,
        child.lastPlayedAt,
      ]),
    ).toEqual([
      [
        'CONSENTED',
        '2026-11-02T00:00:00.000Z',
        null,
        '2026-11-19T08:00:00.000Z',
      ],
      ['PENDING_REQUEST', null, 'Chồi 2', null],
    ]);
  });
});
