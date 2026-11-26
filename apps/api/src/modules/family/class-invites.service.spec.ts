import { randomUUID } from 'node:crypto';
import type { ConfigType } from '@nestjs/config';
import type familyConfig from '../../common/config/family.config.js';
import type { Principal } from '../../common/security/principal.js';
import type { ClassroomsService } from '../classrooms/classrooms.service.js';
import { ClassInvitesService } from './class-invites.service.js';
import type { FamilyRepository, JoinRequestRow } from './family.repository.js';

const teacher: Principal = {
  userId: randomUUID(),
  fullName: 'Cô Lan',
  email: 'lan@example.test',
  phone: '',
  address: '',
  status: 'ACTIVE',
  roles: ['ROLE_TEACHER'],
  permissions: ['READ_OWN_CLASSROOMS'],
};

function request(
  classId: string,
  overrides: { status?: 'PENDING' | 'APPROVED'; childStatus?: 'ACTIVE' | 'DISABLED'; dob?: string } = {},
): JoinRequestRow {
  return {
    requestId: randomUUID(),
    childId: randomUUID(),
    classId,
    guardianId: randomUUID(),
    status: overrides.status ?? 'PENDING',
    consentVersion: 'v1',
    consentScope: [],
    consentedAt: new Date('2026-11-20T00:00:00.000Z'),
    requestedAt: new Date('2026-11-20T00:00:00.000Z'),
    decidedAt: null,
    child: {
      fullName: 'Bé An',
      dob: new Date(`${overrides.dob ?? '2021-05-01'}T00:00:00.000Z`),
      gender: 'MALE',
      status: overrides.childStatus ?? 'ACTIVE',
    },
    guardian: { relationship: 'MOTHER', user: { fullName: 'Mẹ An', email: 'me@example.test' } },
  } as unknown as JoinRequestRow;
}

function setup() {
  const classId = randomUUID();
  const rows = new Map<string, JoinRequestRow>();
  const repository = {
    findJoinRequest: vi.fn((_classId: string, id: string) => Promise.resolve(rows.get(id) ?? null)),
    approve: vi.fn((): Promise<'OK' | 'TAKEN' | 'HAS_CLASS'> => Promise.resolve('OK')),
  };
  const classrooms = {
    requireTeacherOfActive: vi.fn(() => Promise.resolve()),
    // Lá: 5–6 years.
    classroom: vi.fn(() => Promise.resolve({ classId, ageGroup: { minAge: 5, maxAge: 6 } })),
  };
  const service = new ClassInvitesService(
    repository as unknown as FamilyRepository,
    classrooms as unknown as ClassroomsService,
    {} as ConfigType<typeof familyConfig>,
  );
  service.now = () => new Date('2026-11-26T03:00:00.000Z');
  const add = (row: JoinRequestRow) => {
    rows.set(row.requestId, row);
    return row.requestId;
  };
  return { service, repository, classrooms, classId, add };
}

describe('ClassInvitesService.approveBatch', () => {
  it('approves eligible requests and reports every other one with a reason', async () => {
    const { service, repository, classId, add } = setup();
    const ok = add(request(classId));
    const decided = add(request(classId, { status: 'APPROVED' }));
    const disabled = add(request(classId, { childStatus: 'DISABLED' }));
    const tooYoung = add(request(classId, { dob: '2023-01-01' }));
    const missing = randomUUID();

    await expect(service.approveBatch(teacher, classId, [ok, decided, disabled, tooYoung, missing]))
      .resolves.toEqual({
        completedIds: [ok],
        skipped: [
          { id: decided, reason: 'ALREADY_DECIDED' },
          { id: disabled, reason: 'NOT_ELIGIBLE' },
          { id: tooYoung, reason: 'AGE_REVIEW' },
          { id: missing, reason: 'NOT_ELIGIBLE' },
        ],
      });
    expect(repository.approve).toHaveBeenCalledOnce();
  });

  it('maps races in the approval transaction and keeps going after a failure', async () => {
    const { service, repository, classId, add } = setup();
    const taken = add(request(classId));
    const hasClass = add(request(classId));
    const broken = add(request(classId));
    const ok = add(request(classId));
    repository.approve
      .mockResolvedValueOnce('TAKEN')
      .mockResolvedValueOnce('HAS_CLASS')
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce('OK');

    await expect(service.approveBatch(teacher, classId, [taken, hasClass, broken, ok]))
      .resolves.toEqual({
        completedIds: [ok],
        skipped: [
          { id: taken, reason: 'ALREADY_DECIDED' },
          { id: hasClass, reason: 'HAS_CLASS' },
          { id: broken, reason: 'FAILED' },
        ],
      });
  });

  it('refuses the whole batch when the teacher does not manage the active class', async () => {
    const { service, repository, classrooms, classId, add } = setup();
    const id = add(request(classId));
    classrooms.requireTeacherOfActive.mockRejectedValueOnce(new Error('forbidden'));
    await expect(service.approveBatch(teacher, classId, [id])).rejects.toThrow('forbidden');
    expect(repository.findJoinRequest).not.toHaveBeenCalled();
  });
});
