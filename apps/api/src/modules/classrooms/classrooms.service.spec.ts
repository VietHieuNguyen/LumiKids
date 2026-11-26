import { NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ApiProblem } from '../../common/http/api-problem.js';
import type { Principal } from '../../common/security/principal.js';
import type { ChildAuthService } from '../auth/child-auth.service.js';
import type { ClassroomsRepository, Period } from './classrooms.repository.js';
import { ClassroomsService } from './classrooms.service.js';

const problem = (code: string) =>
  expect.objectContaining({ publicCode: code }) as ApiProblem;

const teacher: Principal = {
  userId: randomUUID(),
  fullName: 'Cô Lan',
  email: 'lan@example.test',
  phone: '',
  address: '',
  status: 'ACTIVE',
  roles: ['ROLE_TEACHER'],
  permissions: ['READ_OWN_CLASSROOMS', 'RESET_CHILD_LOGIN_CODES'],
};

function setup() {
  const classA = randomUUID();
  const classB = randomUUID();
  const childId = randomUUID();
  const memberships = new Set([`${classA}:${teacher.userId}`]);
  const periods = new Map<string, Period[]>();
  const child = {
    childId,
    fullName: 'Bé An',
    dob: new Date('2021-05-01T00:00:00.000Z'),
    gender: 'MALE' as const,
    status: 'ACTIVE' as 'ACTIVE' | 'DISABLED',
    loginCodeIssuedAt: null,
  };
  const classroom = (
    classId: string,
    status: 'ACTIVE' | 'ARCHIVED' = 'ACTIVE',
  ) => ({
    classId,
    className: 'Lá 1',
    status,
    schoolYear: {
      schoolYearId: randomUUID(),
      name: '2026–2027',
      startDate: new Date('2026-09-01T00:00:00.000Z'),
      endDate: new Date('2027-05-31T00:00:00.000Z'),
    },
    ageGroup: {
      ageGroupId: 'AGE_5_6',
      name: 'Lá',
      minAge: 5,
      maxAge: 6,
      displayOrder: 3,
    },
    _count: { teachers: 1, enrollments: 1 },
    teachers: [],
    enrollments: [],
  });
  const statuses = new Map<string, 'ACTIVE' | 'ARCHIVED'>([
    [classA, 'ACTIVE'],
    [classB, 'ACTIVE'],
  ]);
  const repository = {
    isClassTeacher: vi.fn((classId: string, userId: string) =>
      Promise.resolve(memberships.has(`${classId}:${userId}`)),
    ),
    listPeriods: vi.fn((classId: string, id: string) =>
      Promise.resolve(id === childId ? (periods.get(classId) ?? []) : []),
    ),
    findChild: vi.fn((id: string) =>
      Promise.resolve(id === childId ? { ...child } : null),
    ),
    findClassroom: vi.fn((classId: string) => {
      const status = statuses.get(classId);
      return Promise.resolve(status ? classroom(classId, status) : null);
    }),
    listPlaySessions: vi.fn(() => Promise.resolve({ total: 0, rows: [] })),
    findCurrentEnrollment: vi.fn(() => {
      for (const [classId, list] of periods)
        for (const period of list)
          if (period.endedAt === null)
            return Promise.resolve({
              enrollmentId: randomUUID(),
              classId,
              startedAt: period.startedAt,
            });
      return Promise.resolve(null);
    }),
    transfer: vi.fn(() => Promise.resolve(true)),
    enroll: vi.fn(() => Promise.resolve()),
    countGuardians: vi.fn(() => Promise.resolve(0)),
    setChildStatus: vi.fn(() => Promise.resolve(true)),
    placeSchoolChild: vi.fn((): Promise<'COMPLETED' | 'NOT_ELIGIBLE' | 'FAMILY_PROFILE' | 'HAS_CLASS'> => Promise.resolve('COMPLETED')),
    countCurrentChildren: vi.fn(() => Promise.resolve(1)),
    updateClassroom: vi.fn(() => Promise.resolve({})),
    isActiveTeacher: vi.fn(() => Promise.resolve(false)),
    addTeacher: vi.fn(),
    findAgeGroup: vi.fn(() => Promise.resolve({})),
  };
  const childAuth = {
    issueFirstCodeInClass: vi.fn().mockResolvedValue(null),
    issueLoginCode: vi.fn(() =>
      Promise.resolve({
        code: 'K7MQ-2HXA',
        issuedAt: new Date('2026-11-16T08:00:00.000Z'),
      }),
    ),
  };
  const service = new ClassroomsService(
    repository as unknown as ClassroomsRepository,
    childAuth as unknown as ChildAuthService,
  );
  return {
    service,
    repository,
    childAuth,
    classA,
    classB,
    childId,
    periods,
    child,
    statuses,
    memberships,
  };
}

describe('ClassroomsService — teacher scope', () => {
  it('hides classes the teacher does not belong to', async () => {
    const { service, classB, childId } = setup();
    await expect(
      service.teacherClassroom(teacher, classB),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.teacherPlayHistory(teacher, classB, childId, {
        page: 1,
        pageSize: 20,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('hides a child who was never in this class', async () => {
    const { service, classA, childId } = setup();
    await expect(
      service.teacherChild(teacher, classA, childId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lets a former teacher see play history only within the periods spent in their class', async () => {
    const { service, repository, classA, classB, childId, periods } = setup();
    const inA: Period = {
      startedAt: new Date('2026-09-05T00:00:00.000Z'),
      endedAt: new Date('2026-12-01T00:00:00.000Z'),
    };
    periods.set(classA, [inA]);
    periods.set(classB, [{ startedAt: inA.endedAt as Date, endedAt: null }]);
    const detail = await service.teacherChild(teacher, classA, childId);
    expect(detail).toMatchObject({
      currentlyEnrolled: false,
      periods: [{ endedAt: '2026-12-01T00:00:00.000Z' }],
    });
    await service.teacherPlayHistory(teacher, classA, childId, {
      page: 2,
      pageSize: 10,
    });
    expect(repository.listPlaySessions).toHaveBeenCalledWith(
      childId,
      [inA],
      2,
      10,
    );
  });

  it('reports missing-code batch outcomes without replacing existing codes', async () => {
    const { service, childAuth, classA, childId } = setup();
    const skipped = randomUUID();
    childAuth.issueFirstCodeInClass.mockResolvedValueOnce({
      code: 'K7MQ-2HXA', issuedAt: new Date('2026-11-16T08:00:00.000Z'),
    });
    await expect(service.issueInitialCodes(teacher, classA, [childId, skipped]))
      .resolves.toEqual({
        issued: [{ childId, code: 'K7MQ-2HXA', issuedAt: '2026-11-16T08:00:00.000Z' }],
        skipped: [{ id: skipped, reason: 'NOT_ELIGIBLE' }],
      });
    expect(childAuth.issueLoginCode).not.toHaveBeenCalled();
  });

  it('places school-managed children in bulk and reports the rest without stopping', async () => {
    const { service, repository, classA } = setup();
    const [ok, family, placed, raced, broken] = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    repository.placeSchoolChild
      .mockResolvedValueOnce('COMPLETED')
      .mockResolvedValueOnce('FAMILY_PROFILE')
      .mockResolvedValueOnce('HAS_CLASS')
      .mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }))
      .mockRejectedValueOnce(new Error('db down'));
    await expect(service.enrollSchoolChildren(classA, [ok, family, placed, raced, broken]))
      .resolves.toEqual({
        completedIds: [ok],
        skipped: [
          { id: family, reason: 'FAMILY_PROFILE' },
          { id: placed, reason: 'HAS_CLASS' },
          { id: raced, reason: 'HAS_CLASS' },
          { id: broken, reason: 'FAILED' },
        ],
      });
  });

  it('moves children of another class in the same batch and skips those already there', async () => {
    const { service, repository, classA, classB } = setup();
    const [moving, staying, raced] = [randomUUID(), randomUUID(), randomUUID()];
    const enrollment = (classId: string) => ({ enrollmentId: randomUUID(), classId, startedAt: new Date('2026-09-05T00:00:00.000Z') });
    repository.findCurrentEnrollment
      .mockResolvedValueOnce(enrollment(classB))
      .mockResolvedValueOnce(enrollment(classA))
      .mockResolvedValueOnce(enrollment(classB));
    repository.transfer.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(service.enrollSchoolChildren(classA, [moving, staying, raced])).resolves.toEqual({
      completedIds: [moving],
      skipped: [
        { id: staying, reason: 'SAME_CLASS' },
        { id: raced, reason: 'NOT_ELIGIBLE' },
      ],
    });
    expect(repository.placeSchoolChild).not.toHaveBeenCalled();
  });

  it('locks children in bulk and reports unchanged and missing profiles', async () => {
    const { service, repository, childId } = setup();
    const [missing, broken] = [randomUUID(), randomUUID()];
    repository.setChildStatus
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error('db down'));
    await expect(service.setChildrenStatus([childId, missing, broken], 'DISABLED')).resolves.toEqual({
      completedIds: [],
      skipped: [
        { id: childId, reason: 'UNCHANGED' },
        { id: missing, reason: 'NOT_ELIGIBLE' },
        { id: broken, reason: 'FAILED' },
      ],
    });
  });

  it('never places a family profile directly: it goes through an invitation', async () => {
    const { service, repository, classA, childId } = setup();
    repository.countGuardians.mockResolvedValueOnce(1);
    await expect(service.transferChild(childId, classA)).rejects.toEqual(problem('CHILD_FAMILY_MANAGED'));
    expect(repository.enroll).not.toHaveBeenCalled();
  });

  it('refuses bulk placement into an archived class', async () => {
    const { service, repository, classA, statuses } = setup();
    statuses.set(classA, 'ARCHIVED');
    await expect(service.enrollSchoolChildren(classA, [randomUUID()])).rejects.toEqual(problem('CLASSROOM_ARCHIVED'));
    expect(repository.placeSchoolChild).not.toHaveBeenCalled();
  });

  it('issues a login code only for a current, active child of an active class', async () => {
    const { service, childAuth, classA, childId, periods, child, statuses } =
      setup();
    periods.set(classA, [
      {
        startedAt: new Date('2026-09-05T00:00:00.000Z'),
        endedAt: new Date('2026-10-01T00:00:00.000Z'),
      },
    ]);
    await expect(
      service.issueLoginCode(teacher, classA, childId),
    ).rejects.toEqual(problem('CHILD_NOT_ENROLLED'));
    periods.set(classA, [
      { startedAt: new Date('2026-10-02T00:00:00.000Z'), endedAt: null },
    ]);
    child.status = 'DISABLED';
    await expect(
      service.issueLoginCode(teacher, classA, childId),
    ).rejects.toEqual(problem('CHILD_DISABLED'));
    child.status = 'ACTIVE';
    statuses.set(classA, 'ARCHIVED');
    await expect(
      service.issueLoginCode(teacher, classA, childId),
    ).rejects.toEqual(problem('CLASSROOM_ARCHIVED'));
    statuses.set(classA, 'ACTIVE');
    expect(childAuth.issueLoginCode).not.toHaveBeenCalled();
    await expect(
      service.issueLoginCode(teacher, classA, childId),
    ).resolves.toEqual({
      childId,
      code: 'K7MQ-2HXA',
      issuedAt: '2026-11-16T08:00:00.000Z',
    });
    expect(childAuth.issueLoginCode).toHaveBeenCalledWith(childId);
  });
});

describe('ClassroomsService — administration', () => {
  it('transfers a child to another active class, keeping one open enrollment', async () => {
    const { service, repository, classA, classB, childId, periods, statuses } =
      setup();
    periods.set(classA, [
      { startedAt: new Date('2026-09-05T00:00:00.000Z'), endedAt: null },
    ]);
    await expect(service.transferChild(childId, classA)).rejects.toEqual(
      problem('CHILD_ALREADY_IN_CLASS'),
    );
    statuses.set(classB, 'ARCHIVED');
    await expect(service.transferChild(childId, classB)).rejects.toEqual(
      problem('CLASSROOM_ARCHIVED'),
    );
    statuses.set(classB, 'ACTIVE');
    await service.transferChild(childId, classB);
    expect(repository.transfer).toHaveBeenCalledWith(
      expect.objectContaining({ classId: classA }),
      childId,
      classB,
      expect.any(Date),
    );
    repository.transfer.mockResolvedValueOnce(false);
    await expect(service.transferChild(childId, classB)).rejects.toEqual(
      problem('ENROLLMENT_CHANGED'),
    );
  });

  it('places a child without a class instead of transferring', async () => {
    const { service, repository, classB, childId } = setup();
    await service.transferChild(childId, classB);
    expect(repository.enroll).toHaveBeenCalledWith(
      childId,
      classB,
      expect.any(Date),
    );
    expect(repository.transfer).not.toHaveBeenCalled();
  });

  it('refuses to archive a class that still has children', async () => {
    const { service, repository, classA } = setup();
    await expect(
      service.updateClassroom(classA, { status: 'ARCHIVED' }),
    ).rejects.toEqual(problem('CLASSROOM_NOT_EMPTY'));
    expect(repository.updateClassroom).not.toHaveBeenCalled();
    repository.countCurrentChildren.mockResolvedValueOnce(0);
    await service.updateClassroom(classA, { status: 'ARCHIVED' });
    expect(repository.updateClassroom).toHaveBeenCalledWith(classA, {
      status: 'ARCHIVED',
    });
  });

  it('adds only active teachers', async () => {
    const { service, repository, classA } = setup();
    await expect(service.addTeacher(classA, randomUUID())).rejects.toEqual(
      problem('TEACHER_INVALID'),
    );
    expect(repository.addTeacher).not.toHaveBeenCalled();
  });
});
