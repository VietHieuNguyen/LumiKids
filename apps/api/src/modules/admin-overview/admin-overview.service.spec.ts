import { randomUUID } from 'node:crypto';
import type { AdminOverviewRepository } from './admin-overview.repository.js';
import { AdminOverviewService } from './admin-overview.service.js';

const now = new Date('2026-11-17T03:00:00.000Z'); // 10:00 in Vietnam
const days = (n: number) => new Date(now.getTime() - n * 86_400_000);

function setup() {
  const classA = randomUUID();
  const classB = randomUUID();
  const classC = randomUUID();
  const klass = (
    classId: string,
    className: string,
    teachers: number,
    children: number,
    open: number,
  ) => ({
    classId,
    className,
    ageGroup: { name: '5–6 tuổi' },
    teachers: Array.from({ length: teachers }, () => ({
      userId: randomUUID(),
    })),
    _count: { enrollments: children, assignments: open },
  });
  const repository = {
    schoolYears: vi.fn(() =>
      Promise.resolve([
        {
          schoolYearId: randomUUID(),
          name: '2026-2027',
          startDate: new Date('2026-09-01T00:00:00.000Z'),
          endDate: new Date('2027-05-31T00:00:00.000Z'),
        },
      ]),
    ),
    activeClasses: vi.fn(() =>
      Promise.resolve([
        klass(classA, 'Lá 1', 1, 20, 2),
        klass(classB, 'Lá 2', 0, 18, 0),
        klass(classC, 'Mầm 1', 1, 0, 0),
      ]),
    ),
    activeTeachers: vi.fn(() =>
      Promise.resolve([
        {
          userId: randomUUID(),
          fullName: 'Cô Lan',
          classrooms: [{ classId: classA }],
          authSessions: [{ createdAt: days(1) }],
        },
        {
          userId: randomUUID(),
          fullName: 'Cô Mai',
          classrooms: [{ classId: classC }],
          authSessions: [{ createdAt: days(30) }],
        },
        {
          userId: randomUUID(),
          fullName: 'Cô Hoa',
          classrooms: [],
          authSessions: [],
        },
      ]),
    ),
    libraryGames: vi.fn(() => Promise.resolve(12)),
    unassignedChildren: vi.fn(() => Promise.resolve(1)),
    childrenWithoutCode: vi.fn(() => Promise.resolve(5)),
    archivedGamesInOpenAssignments: vi.fn(() => Promise.resolve(0)),
    pendingReplayRequests: vi.fn(() => Promise.resolve(2)),
    daily: vi.fn(() =>
      Promise.resolve([
        { day: '2026-11-17', sessions: 10, completed: 8, children: 6 },
        { day: '2026-11-08', sessions: 4, completed: 1, children: 3 },
      ]),
    ),
    activeChildren: vi.fn(() =>
      Promise.resolve({
        total: 6,
        perClass: [{ classId: classA, children: 6 }],
      }),
    ),
  };
  const service = new AdminOverviewService(
    repository as unknown as AdminOverviewRepository,
  );
  service.now = () => now;
  return { service, repository, classA, classB, classC };
}

describe('AdminOverviewService', () => {
  it('turns raw counts into what the admin must act on', async () => {
    const { service, repository, classA, classB, classC } = setup();
    const result = await service.overview();
    expect(repository.daily).toHaveBeenCalledWith(
      '2026-11-04',
      'Asia/Ho_Chi_Minh',
    );
    expect(repository.activeChildren).toHaveBeenCalledWith(
      '2026-11-11',
      'Asia/Ho_Chi_Minh',
    );
    expect(result.totals).toEqual({
      activeClasses: 3,
      enrolledChildren: 38,
      activeTeachers: 3,
      libraryGames: 12,
    });
    expect(result.days).toHaveLength(14);
    expect(result.week).toEqual({
      sessions: 10,
      previousSessions: 4,
      completed: 8,
      activeChildren: 6,
    });
    expect(
      result.attention.classesWithoutTeacher.map((c) => c.classId),
    ).toEqual([classB]);
    expect(
      result.attention.classesWithoutChildren.map((c) => c.classId),
    ).toEqual([classC]);
    // An empty class is reported once (no children), not also as "no assignment".
    expect(
      result.attention.classesWithoutOpenAssignment.map((c) => c.classId),
    ).toEqual([classB]);
    // Only teachers in charge of a class count as dormant; Cô Hoa has none.
    expect(result.attention.dormantTeachers.map((t) => t.fullName)).toEqual([
      'Cô Mai',
    ]);
    expect(result.schoolYear).toMatchObject({
      name: '2026-2027',
      daysLeft: 195,
      hasNextYear: false,
    });
    expect(result.classes.find((c) => c.classId === classA)).toMatchObject({
      activeChildren7d: 6,
      openAssignments: 2,
    });
  });
});
