import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { AdminOverviewRepository } from '../src/modules/admin-overview/admin-overview.repository.js';
import { TeacherAccountsRepository } from '../src/modules/auth/teacher-accounts.repository.js';

const testUrl = process.env.TEST_DATABASE_URL;

// Never falls back to DATABASE_URL or applies migrations automatically.
describe.skipIf(!testUrl)(
  'Admin dashboard and teacher accounts with real PostgreSQL (explicit test DB only)',
  () => {
    let prisma: PrismaService;
    let overview: AdminOverviewRepository;
    let accounts: TeacherAccountsRepository;
    const cleanups: (() => Promise<void>)[] = [];

    beforeAll(async () => {
      if (!testUrl) throw new Error('TEST_DATABASE_URL is required.');
      let safeTarget = false;
      try {
        const url = new URL(testUrl);
        const database = decodeURIComponent(url.pathname.slice(1));
        safeTarget =
          ['postgresql:', 'postgres:'].includes(url.protocol) &&
          ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
          database.endsWith('_test') &&
          database !== 'lumikids_db';
      } catch {
        /* Never print a connection string. */
      }
      if (!safeTarget)
        throw new Error(
          'Integration tests require a local dedicated database whose name ends in _test.',
        );
      prisma = new PrismaService({ url: testUrl });
      overview = new AdminOverviewRepository(prisma);
      accounts = new TeacherAccountsRepository(prisma);
      await prisma.onModuleInit();
    });
    afterEach(async () => {
      for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
    });
    afterAll(async () => {
      await prisma?.onModuleDestroy();
    });

    it('counts sessions per Vietnam day and distinct active children per class', async () => {
      const year = await prisma.schoolYear.create({
        data: {
          name: `Fixture ${randomUUID()}`,
          startDate: new Date('2026-09-01T00:00:00.000Z'),
          endDate: new Date('2027-05-31T00:00:00.000Z'),
        },
      });
      const klass = await prisma.classroom.create({
        data: {
          className: 'A',
          schoolYearId: year.schoolYearId,
          ageGroupId: 'AGE_5_6',
        },
      });
      const child = await prisma.child.create({
        data: {
          fullName: 'Integration child',
          dob: new Date('2021-05-01T00:00:00.000Z'),
          gender: 'MALE',
          enrollments: { create: { classId: klass.classId } },
        },
      });
      const author = await prisma.user.create({
        data: {
          email: `${randomUUID()}@example.test`,
          fullName: 'Integration author',
          phone: '',
          address: '',
          passwordHash: 'not-a-real-hash',
        },
      });
      const activity = await prisma.activity.create({
        data: {
          name: 'Integration game',
          createdBy: author.userId,
          saveRequestId: randomUUID(),
          saveFingerprint: '0'.repeat(64),
        },
      });
      const version = await prisma.activityVersion.create({
        data: {
          activityId: activity.activityId,
          versionNumber: 1,
          instruction: 'Fixture',
          difficulty: 'EASY',
          gameType: 'COUNTING',
          content: {},
          completionRule: 'CORRECT_CHOICE',
        },
      });
      cleanups.push(async () => {
        await prisma.playSession.deleteMany({
          where: { childId: child.childId },
        });
        await prisma.activityVersion.delete({
          where: { versionId: version.versionId },
        });
        await prisma.activity.delete({
          where: { activityId: activity.activityId },
        });
        await prisma.user.delete({ where: { userId: author.userId } });
        await prisma.classroomEnrollment.deleteMany({
          where: { childId: child.childId },
        });
        await prisma.child.delete({ where: { childId: child.childId } });
        await prisma.classroom.delete({ where: { classId: klass.classId } });
        await prisma.schoolYear.delete({
          where: { schoolYearId: year.schoolYearId },
        });
      });
      // 2026-11-16T18:30Z is already 17/11 in Vietnam; 2026-11-16T10:00Z is 16/11.
      for (const [startedAt, status] of [
        ['2026-11-16T18:30:00.000Z', 'COMPLETED'],
        ['2026-11-16T19:00:00.000Z', 'IN_PROGRESS'],
        ['2026-11-16T10:00:00.000Z', 'COMPLETED'],
      ] as const)
        await prisma.playSession.create({
          data: {
            childId: child.childId,
            versionId: version.versionId,
            startRequestId: randomUUID(),
            startedAt: new Date(startedAt),
            status,
          },
        });
      const days = await overview.daily('2026-11-16', 'Asia/Ho_Chi_Minh');
      const byDay = new Map(days.map((row) => [row.day, row]));
      expect(byDay.get('2026-11-17')).toEqual({
        day: '2026-11-17',
        sessions: 2,
        completed: 1,
        children: 1,
      });
      expect(byDay.get('2026-11-16')).toEqual({
        day: '2026-11-16',
        sessions: 1,
        completed: 1,
        children: 1,
      });
      const active = await overview.activeChildren(
        '2026-11-17',
        'Asia/Ho_Chi_Minh',
      );
      expect(active.perClass).toContainEqual({
        classId: klass.classId,
        children: 1,
      });
      const classes = await overview.activeClasses(new Date());
      const row = classes.find((item) => item.classId === klass.classId);
      expect(row?._count).toEqual({ enrollments: 1, assignments: 0 });
      expect(row?.teachers).toEqual([]);
    });

    it('creates a teacher, and locking or resetting the password revokes sessions', async () => {
      const email = `${randomUUID()}@example.test`;
      // Roles come from the seed; a fresh test DB may not have them yet.
      if (!(await prisma.role.findUnique({ where: { code: 'ROLE_TEACHER' } }))) {
        await prisma.role.create({ data: { code: 'ROLE_TEACHER' } });
        cleanups.push(async () => {
          await prisma.role.delete({ where: { code: 'ROLE_TEACHER' } });
        });
      }
      const userId = await accounts.create({
        fullName: 'Cô Test',
        email,
        phone: '',
        specialization: '',
        passwordHash: 'hash-1',
      });
      cleanups.push(async () => {
        await prisma.authSession.deleteMany({ where: { userId } });
        await prisma.userRole.deleteMany({ where: { userId } });
        await prisma.user.delete({ where: { userId } });
      });
      expect((await accounts.find(userId))?.status).toBe('ACTIVE');
      await expect(
        accounts.create({
          fullName: 'Trùng',
          email,
          phone: '',
          specialization: '',
          passwordHash: 'x',
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
      const session = () =>
        prisma.authSession.create({
          data: { userId, expiresAt: new Date(Date.now() + 3_600_000) },
          select: { sessionId: true },
        });
      const first = await session();
      await accounts.update(userId, { status: 'DISABLED' });
      expect(
        (
          await prisma.authSession.findUniqueOrThrow({
            where: { sessionId: first.sessionId },
          })
        ).revokedAt,
      ).not.toBeNull();
      await accounts.update(userId, { status: 'ACTIVE' });
      const second = await session();
      await accounts.setPassword(userId, 'hash-2');
      expect(
        (
          await prisma.authSession.findUniqueOrThrow({
            where: { sessionId: second.sessionId },
          })
        ).revokedAt,
      ).not.toBeNull();
      expect((await accounts.findPasswordHash(userId))?.passwordHash).toBe(
        'hash-2',
      );
      // Only teachers are visible here.
      expect(await accounts.find(randomUUID())).toBeNull();
    });
  },
);
