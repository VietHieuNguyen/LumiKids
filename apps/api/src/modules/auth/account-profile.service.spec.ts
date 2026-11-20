import { randomUUID } from 'node:crypto';
import type { ApiProblem } from '../../common/http/api-problem.js';
import type { Principal } from '../../common/security/principal.js';
import type { AccountProfileRepository } from './account-profile.repository.js';
import { AccountProfileService } from './account-profile.service.js';

const problem = (code: string) =>
  expect.objectContaining({ publicCode: code }) as ApiProblem;

function setup(role: 'ROLE_TEACHER' | 'ROLE_GUARDIAN' | 'ROLE_ADMIN') {
  const userId = randomUUID();
  const classId = randomUUID();
  const row = {
    userId,
    fullName: 'Cô Lan',
    email: 'lan@example.test',
    phone: '',
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    roles: [{ role: { code: role } }],
    authSessions: [{ createdAt: new Date('2026-11-20T08:00:00.000Z') }, { createdAt: new Date('2026-11-18T08:00:00.000Z') }],
    _count: { authSessions: 2 },
    teacherProfile: role === 'ROLE_TEACHER' ? { specialization: 'Mầm non' } : null,
    classrooms:
      role === 'ROLE_TEACHER'
        ? [{ classroom: { classId, className: 'Lá 1', schoolYear: { name: '2026-2027' }, ageGroup: { name: '5-6 tuổi' }, _count: { enrollments: 18 } } }]
        : [],
    guardianProfile:
      role === 'ROLE_GUARDIAN'
        ? { relationship: 'MOTHER' as const, children: [{ child: { childId: randomUUID(), fullName: 'Bé An', dob: new Date('2021-05-02T00:00:00.000Z'), enrollments: [] } }] }
        : null,
  };
  const repository = {
    find: vi.fn(() => Promise.resolve(row)),
    update: vi.fn(() => Promise.resolve()),
  };
  const service = new AccountProfileService(repository as unknown as AccountProfileRepository);
  const actor = { userId } as Principal;
  return { service, repository, actor, classId };
}

describe('AccountProfileService', () => {
  it('shows a teacher their classes and the sign-in before this one', async () => {
    const { service, actor, classId } = setup('ROLE_TEACHER');
    const profile = await service.get(actor);
    expect(profile.previousLoginAt).toBe('2026-11-18T08:00:00.000Z');
    expect(profile.teacher?.classes).toEqual([
      { classId, className: 'Lá 1', schoolYearName: '2026-2027', ageGroupName: '5-6 tuổi', childCount: 18 },
    ]);
    expect(profile.guardian).toBeNull();
  });

  it('shows a guardian their children, with no class for a family-only child', async () => {
    const { service, actor } = setup('ROLE_GUARDIAN');
    const profile = await service.get(actor);
    expect(profile.guardian?.children[0]).toMatchObject({ fullName: 'Bé An', dob: '2021-05-02', className: null });
    expect(profile.teacher).toBeNull();
  });

  it('updates only the fields that belong to the role', async () => {
    const { service, repository, actor } = setup('ROLE_GUARDIAN');
    await service.update(actor, { fullName: 'Nguyễn Thị Lan', relationship: 'GRANDPARENT' });
    expect(repository.update).toHaveBeenCalledWith(actor.userId, { fullName: 'Nguyễn Thị Lan', relationship: 'GRANDPARENT' });
    await expect(service.update(actor, { specialization: 'x' })).rejects.toEqual(problem('PROFILE_FIELD_NOT_ALLOWED'));
  });

  it('an admin cannot set teacher or guardian fields', async () => {
    const { service, repository, actor } = setup('ROLE_ADMIN');
    await expect(service.update(actor, { relationship: 'MOTHER' })).rejects.toEqual(problem('PROFILE_FIELD_NOT_ALLOWED'));
    await expect(service.update(actor, { specialization: 'x' })).rejects.toEqual(problem('PROFILE_FIELD_NOT_ALLOWED'));
    expect(repository.update).not.toHaveBeenCalled();
  });
});
