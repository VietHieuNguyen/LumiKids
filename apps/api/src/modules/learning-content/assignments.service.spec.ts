import { NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ApiProblem } from '../../common/http/api-problem.js';
import type {
  ChildPrincipal,
  Principal,
} from '../../common/security/principal.js';
import type { ClassroomsService } from '../classrooms/classrooms.service.js';
import { recipientProgress } from './assignment-progress.js';
import type {
  AssignmentsRepository,
  SessionFact,
} from './assignments.repository.js';
import { AssignmentsService } from './assignments.service.js';

const problem = (code: string) =>
  expect.objectContaining({ publicCode: code }) as ApiProblem;
const at = (day: number, hour = 10) => new Date(Date.UTC(2026, 10, day, hour));

const teacher: Principal = {
  userId: randomUUID(),
  fullName: 'Cô Lan',
  email: 'lan@example.test',
  phone: '',
  address: '',
  status: 'ACTIVE',
  roles: ['ROLE_TEACHER'],
  permissions: ['READ_OWN_CLASSROOMS', 'ASSIGN_ACTIVITIES'],
};

function version(versionId: string, status: 'ACTIVE' | 'ARCHIVED' = 'ACTIVE') {
  return {
    versionId,
    gameType: 'COUNTING' as const,
    difficulty: 'EASY' as const,
    content: {},
    activity: {
      name: `Trò ${versionId.slice(0, 4)}`,
      status,
      ageGroup: { name: 'Lá (5–6 tuổi)', minAge: 5, maxAge: 6 },
    },
  };
}

function setup() {
  const classId = randomUUID();
  const [an, binh, chi] = [randomUUID(), randomUUID(), randomUUID()];
  const v1 = randomUUID();
  const v2 = randomUUID();
  const groupId = randomUUID();
  const child: ChildPrincipal = {
    childId: an,
    fullName: 'An',
    permissions: ['PLAY_GAMES'],
  };
  const classrooms = {
    requireTeacherOf: vi.fn(() => Promise.resolve()),
    requireTeacherOfActive: vi.fn(() =>
      Promise.resolve({ classId, className: 'Lá 1' }),
    ),
    currentChildren: vi.fn(() =>
      Promise.resolve(
        [an, binh, chi].map((childId) => ({
          childId,
          fullName: childId,
          status: 'ACTIVE',
        })),
      ),
    ),
    group: vi.fn(() =>
      Promise.resolve({ groupId, name: 'Thỏ', childIds: [an, binh] }),
    ),
    currentClassId: vi.fn(() => Promise.resolve(classId as string | null)),
    childNames: vi.fn(() => Promise.resolve(new Map())),
  };
  const forChildRows: unknown[] = [];
  const dobs = new Map<string, Date>();
  const sessions: SessionFact[] = [];
  const repository = {
    playableVersions: vi.fn((ids: string[]) =>
      Promise.resolve(
        ids.filter((id) => id !== 'archived').map((id) => version(id)),
      ),
    ),
    create: vi.fn(() => Promise.resolve(randomUUID())),
    // Born 2021-06-01: 65 months in November 2026, inside "Lá" (60–71 months).
    childDobs: vi.fn((ids: string[]) =>
      Promise.resolve(
        ids.map((childId) => ({
          childId,
          fullName: 'Bé',
          dob: dobs.get(childId) ?? new Date('2021-06-01T00:00:00.000Z'),
        })),
      ),
    ),
    find: vi.fn(() => Promise.resolve(null)),
    forChild: vi.fn(() => Promise.resolve(forChildRows)),
    sessions: vi.fn(() => Promise.resolve(sessions)),
    findRecipient: vi.fn(),
    requestReplay: vi.fn(() =>
      Promise.resolve({
        status: 'PENDING',
        requestedAt: at(17),
        grantedUntil: null,
      }),
    ),
  };
  const service = new AssignmentsService(
    repository as unknown as AssignmentsRepository,
    classrooms as unknown as ClassroomsService,
  );
  service.now = () => at(12);
  // `create` ends with `detail`; it is covered separately.
  vi.spyOn(service, 'detail').mockResolvedValue({} as never);
  const recipientRow = (opts: {
    opensAt?: Date;
    dueAt?: Date | null;
    extendedUntil?: Date | null;
    versions?: string[];
  }) => ({
    recipientId: randomUUID(),
    extendedUntil: opts.extendedUntil ?? null,
    replayRequests: [],
    assignment: {
      assignmentId: randomUUID(),
      title: 'Bài',
      note: '',
      status: 'ACTIVE',
      opensAt: opts.opensAt ?? at(10),
      dueAt: opts.dueAt === undefined ? at(15) : opts.dueAt,
      items: (opts.versions ?? [v1]).map((id) => ({ version: version(id) })),
    },
  });
  return {
    service,
    repository,
    classrooms,
    classId,
    an,
    binh,
    chi,
    v1,
    v2,
    groupId,
    child,
    forChildRows,
    sessions,
    recipientRow,
    dobs,
  };
}

describe('recipientProgress', () => {
  const v1 = randomUUID();
  const v2 = randomUUID();
  const fact = (
    versionId: string,
    status: SessionFact['status'],
    day: number,
  ): SessionFact => ({
    childId: 'c',
    versionId,
    status,
    startedAt: at(day),
  });
  it('is complete only when every game has a COMPLETED session after opening (late ones count)', () => {
    expect(recipientProgress([v1, v2], at(10), []).completionStatus).toBe(
      'NOT_STARTED',
    );
    expect(
      recipientProgress([v1, v2], at(10), [fact(v1, 'ABANDONED', 11)])
        .completionStatus,
    ).toBe('IN_PROGRESS');
    expect(
      recipientProgress([v1, v2], at(10), [fact(v1, 'COMPLETED', 11)]),
    ).toEqual({
      completedVersionIds: [v1],
      completionStatus: 'IN_PROGRESS',
    });
    expect(
      recipientProgress([v1, v2], at(10), [
        fact(v1, 'COMPLETED', 11),
        fact(v2, 'COMPLETED', 25),
      ]).completionStatus,
    ).toBe('COMPLETED');
  });
  it('ignores sessions played before the assignment opened', () => {
    expect(
      recipientProgress([v1], at(10), [fact(v1, 'COMPLETED', 9)])
        .completionStatus,
    ).toBe('NOT_STARTED');
  });
});

describe('AssignmentsService — teacher', () => {
  it.each([
    [3, 4, '2023-11-12', true],
    [3, 4, '2022-11-12', true],
    [3, 4, '2021-11-12', true],
    [4, 5, '2023-11-12', false],
    [4, 5, '2022-11-12', true],
    [4, 5, '2021-11-12', true],
    [5, 6, '2023-11-12', false],
    [5, 6, '2022-11-12', false],
    [5, 6, '2021-11-12', true],
    [4, 5, '2022-11-13', false],
  ])(
    'game %i–%i with birthday %s: eligible=%s',
    async (minAge, maxAge, dob, eligible) => {
      const { service, repository, classId, an, v1, dobs } = setup();
      dobs.set(an, new Date(`${dob}T00:00:00.000Z`));
      repository.playableVersions.mockResolvedValueOnce([
        {
          ...version(v1),
          activity: {
            ...version(v1).activity,
            ageGroup: { name: 'Age group', minAge, maxAge },
          },
        },
      ]);
      const result = service.create(teacher, classId, {
        title: 'A',
        note: '',
        dueAt: null,
        versionIds: [v1],
        target: { type: 'CHILDREN', childIds: [an] },
      });
      if (eligible) {
        await expect(result).resolves.toBeDefined();
        expect(repository.create).toHaveBeenCalledOnce();
      } else {
        await expect(result).rejects.toMatchObject(
          problem('ASSIGNMENT_AGE_MISMATCH'),
        );
        expect(repository.create).not.toHaveBeenCalled();
      }
    },
  );

  it('checks every recipient against every game, including future openings in Vietnam', async () => {
    const { service, repository, an, binh, v1, v2, dobs } = setup();
    dobs.set(an, new Date('2021-11-21T00:00:00.000Z'));
    dobs.set(binh, new Date('2022-11-21T00:00:00.000Z'));
    repository.playableVersions.mockImplementation(async (ids: string[]) =>
      ids.map((id) => ({
        ...version(id),
        activity: {
          ...version(id).activity,
          ageGroup: {
            name: 'Age group',
            minAge: id === v1 ? 4 : 5,
            maxAge: id === v1 ? 5 : 6,
          },
        },
      })),
    );
    const opensAt = new Date('2026-11-20T17:00:00.000Z'); // November 21 in Vietnam.
    await expect(
      service.requireAgeFit([v1], [an, binh], opensAt),
    ).resolves.toBeUndefined();
    await expect(
      service.requireAgeFit([v1, v2], [an, binh], opensAt),
    ).rejects.toMatchObject(problem('ASSIGNMENT_AGE_MISMATCH'));
    await expect(
      service.requireAgeFit([v1, v2], [an], opensAt),
    ).resolves.toBeUndefined();
    await expect(
      service.requireAgeFit([v1], [binh], new Date('2026-11-20T16:59:00.000Z')),
    ).rejects.toMatchObject(problem('ASSIGNMENT_AGE_MISMATCH'));
  });

  it('rejects a recipient below the minimum playing age, by months on the opening day', async () => {
    const { service, repository, classId, an, v1, dobs } = setup();
    // 59 months on 2026-11-12: still "Chồi", one month short of "Lá".
    dobs.set(an, new Date('2021-12-01T00:00:00.000Z'));
    const input = {
      title: 'A',
      note: '',
      dueAt: null,
      versionIds: [v1],
      target: { type: 'CHILDREN' as const, childIds: [an] },
    };
    await expect(service.create(teacher, classId, input)).rejects.toMatchObject(
      {
        publicCode: 'ASSIGNMENT_AGE_MISMATCH',
      },
    );
    // The birthday on the opening day counts: born 2021-11-12 → exactly 60 months.
    dobs.set(an, new Date('2021-11-12T00:00:00.000Z'));
    await expect(
      service.create(teacher, classId, input),
    ).resolves.toBeDefined();
    repository.playableVersions.mockResolvedValueOnce([
      { ...version(v1), activity: { ...version(v1).activity, ageGroup: null } },
    ] as never);
    await expect(service.create(teacher, classId, input)).rejects.toMatchObject(
      {
        publicCode: 'GAME_AGE_GROUP_MISSING',
      },
    );
  });

  it('snapshots recipients for the whole class, a group or picked children', async () => {
    const { service, repository, classId, an, binh, chi, v1, groupId } =
      setup();
    await service.create(teacher, classId, {
      title: 'A',
      note: '',
      dueAt: null,
      versionIds: [v1],
      target: { type: 'CLASS' },
    });
    expect(repository.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        childIds: [an, binh, chi],
        targetLabel: 'Cả lớp',
        opensAt: at(12),
      }),
    );
    await service.create(teacher, classId, {
      title: 'A',
      note: '',
      dueAt: null,
      versionIds: [v1],
      target: { type: 'GROUP', groupId },
    });
    expect(repository.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        childIds: [an, binh],
        targetLabel: 'Nhóm Thỏ',
      }),
    );
    await service.create(teacher, classId, {
      title: 'A',
      note: '',
      dueAt: null,
      versionIds: [v1],
      target: { type: 'CHILDREN', childIds: [chi] },
    });
    expect(repository.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ childIds: [chi], targetLabel: '1 trẻ' }),
    );
  });

  it('refuses children outside the class, archived games and bad deadlines', async () => {
    const { service, repository, classId, v1 } = setup();
    const base = {
      title: 'A',
      note: '',
      versionIds: [v1],
      target: { type: 'CLASS' as const },
    };
    await expect(
      service.create(teacher, classId, {
        ...base,
        dueAt: null,
        target: { type: 'CHILDREN', childIds: [randomUUID()] },
      }),
    ).rejects.toEqual(problem('ASSIGNMENT_RECIPIENTS_INVALID'));
    await expect(
      service.create(teacher, classId, {
        ...base,
        dueAt: null,
        versionIds: [v1, 'archived'],
      }),
    ).rejects.toEqual(problem('ASSIGNMENT_GAMES_INVALID'));
    await expect(
      service.create(teacher, classId, {
        ...base,
        dueAt: at(11).toISOString(),
      }),
    ).rejects.toEqual(problem('ASSIGNMENT_PERIOD_INVALID'));
    await expect(
      service.create(teacher, classId, {
        ...base,
        opensAt: at(20).toISOString(),
        dueAt: at(18).toISOString(),
      }),
    ).rejects.toEqual(problem('ASSIGNMENT_PERIOD_INVALID'));
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('refuses an assignment nobody would receive', async () => {
    const { service, classrooms, classId, v1, groupId } = setup();
    classrooms.group.mockResolvedValueOnce({
      groupId,
      name: 'Rỗng',
      childIds: [],
    });
    await expect(
      service.create(teacher, classId, {
        title: 'A',
        note: '',
        dueAt: null,
        versionIds: [v1],
        target: { type: 'GROUP', groupId },
      }),
    ).rejects.toEqual(problem('ASSIGNMENT_NO_RECIPIENTS'));
  });
});

describe('AssignmentsService — child', () => {
  it('lists open assignments first and marks closed ones', async () => {
    const { service, forChildRows, recipientRow, child } = setup();
    forChildRows.push(
      recipientRow({ dueAt: at(11) }),
      recipientRow({ dueAt: null }),
      recipientRow({ dueAt: at(14) }),
      recipientRow({ dueAt: at(11), extendedUntil: at(13) }),
    );
    const list = await service.forChild(child);
    expect(list.map((item) => [item.state, item.playableUntil])).toEqual([
      ['OPEN', at(13).toISOString()],
      ['OPEN', at(14).toISOString()],
      ['OPEN', null],
      ['CLOSED', at(11).toISOString()],
    ]);
  });

  it('a child without a class sees nothing', async () => {
    const { service, classrooms, child } = setup();
    classrooms.currentClassId.mockResolvedValueOnce(null);
    await expect(service.forChild(child)).resolves.toEqual([]);
  });

  it('only open assignments make a game playable', async () => {
    const { service, forChildRows, recipientRow, child, v1, v2 } = setup();
    forChildRows.push(
      recipientRow({ dueAt: at(11), versions: [v1] }),
      recipientRow({ dueAt: at(14), versions: [v2] }),
    );
    await expect(service.playableVersionIds(child.childId)).resolves.toEqual(
      new Set([v2]),
    );
  });

  it('asks for a replay only after the deadline, and only for its own current class', async () => {
    const { service, repository, classId, child } = setup();
    const recipient = (dueAt: Date, otherClass = false) => ({
      recipientId: randomUUID(),
      extendedUntil: null,
      assignment: {
        classId: otherClass ? randomUUID() : classId,
        status: 'ACTIVE',
        opensAt: at(10),
        dueAt,
      },
    });
    repository.findRecipient.mockResolvedValueOnce(recipient(at(14)));
    await expect(service.requestReplay(child, randomUUID())).rejects.toEqual(
      problem('REPLAY_NOT_NEEDED'),
    );
    repository.findRecipient.mockResolvedValueOnce(recipient(at(11), true));
    await expect(
      service.requestReplay(child, randomUUID()),
    ).rejects.toBeInstanceOf(NotFoundException);
    repository.findRecipient.mockResolvedValueOnce(recipient(at(11)));
    await expect(
      service.requestReplay(child, randomUUID()),
    ).resolves.toMatchObject({ status: 'PENDING' });
  });
});
