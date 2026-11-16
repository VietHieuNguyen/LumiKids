import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ClassroomsRepository } from '../src/modules/classrooms/classrooms.repository.js';
import { ChildAuthRepository } from '../src/modules/auth/child-auth.repository.js';
import { newRefreshToken } from '../src/modules/auth/refresh-token.js';

const testUrl = process.env.TEST_DATABASE_URL;

// Never falls back to DATABASE_URL or applies migrations automatically.
describe.skipIf(!testUrl)(
  'Classrooms with real PostgreSQL (explicit test DB only)',
  () => {
    let prisma: PrismaService;
    let classrooms: ClassroomsRepository;
    let childAuth: ChildAuthRepository;
    let schoolYearId: string;
    let classA: string;
    let classB: string;
    const fixtures: (() => Promise<void>)[] = [];

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
      classrooms = new ClassroomsRepository(prisma);
      childAuth = new ChildAuthRepository(prisma);
      await prisma.onModuleInit();
    });
    beforeEach(async () => {
      const year = await classrooms.createSchoolYear({
        name: `Fixture ${randomUUID()}`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-05-31T00:00:00.000Z'),
      });
      schoolYearId = year.schoolYearId;
      classA = (
        await classrooms.createClassroom({
          className: 'A',
          schoolYearId,
          ageGroupId: 'AGE_5_6',
        })
      ).classId;
      classB = (
        await classrooms.createClassroom({
          className: 'B',
          schoolYearId,
          ageGroupId: 'AGE_5_6',
        })
      ).classId;
    });
    afterEach(async () => {
      for (const cleanup of fixtures.splice(0)) await cleanup();
      const ids = [classA, classB];
      const children = await prisma.classroomEnrollment.findMany({
        where: { classId: { in: ids } },
        select: { childId: true },
      });
      const childIds = [...new Set(children.map((row) => row.childId))];
      await prisma.playSession.deleteMany({
        where: { childId: { in: childIds } },
      });
      await prisma.classroomEnrollment.deleteMany({
        where: { classId: { in: ids } },
      });
      await prisma.child.deleteMany({ where: { childId: { in: childIds } } });
      await prisma.classroom.deleteMany({ where: { classId: { in: ids } } });
      await prisma.schoolYear.deleteMany({ where: { schoolYearId } });
    });
    afterAll(async () => {
      await prisma?.onModuleDestroy();
    });

    const profile = {
      fullName: 'Integration child',
      dob: new Date('2021-05-01T00:00:00.000Z'),
      gender: 'FEMALE' as const,
    };

    it('keeps one open enrollment per child and a closed history on transfer', async () => {
      const start = new Date();
      const { childId } = await classrooms.createChild(profile, classA, start);
      // The database itself refuses a second open enrollment.
      await expect(
        prisma.classroomEnrollment.create({
          data: { classId: classB, childId },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
      const current = await classrooms.findCurrentEnrollment(childId);
      expect(current?.classId).toBe(classA);
      if (!current) return;
      expect(await classrooms.transfer(current, childId, classB, start)).toBe(
        true,
      );
      // The same open enrollment cannot be closed twice (a concurrent transfer loses).
      expect(
        await classrooms.transfer(current, childId, classA, new Date()),
      ).toBe(false);
      const inA = await classrooms.listPeriods(classA, childId);
      const inB = await classrooms.listPeriods(classB, childId);
      expect(inA).toHaveLength(1);
      expect(inA[0].endedAt).not.toBeNull();
      expect(inB).toEqual([{ startedAt: inA[0].endedAt, endedAt: null }]);
    });

    it('lists only the play sessions started inside the given periods', async () => {
      const { childId } = await classrooms.createChild(
        profile,
        classA,
        new Date('2026-09-05T00:00:00.000Z'),
      );
      // A throw-away author and game; sessions only need a version to point at.
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
      fixtures.push(async () => {
        await prisma.playSession.deleteMany({
          where: { versionId: version.versionId },
        });
        await prisma.activityVersion.delete({
          where: { versionId: version.versionId },
        });
        await prisma.activity.delete({
          where: { activityId: activity.activityId },
        });
        await prisma.user.delete({ where: { userId: author.userId } });
      });
      for (const startedAt of ['2026-09-10', '2026-10-10', '2026-12-10'])
        await prisma.playSession.create({
          data: {
            childId,
            versionId: version.versionId,
            startRequestId: randomUUID(),
            startedAt: new Date(`${startedAt}T08:00:00.000Z`),
          },
        });
      const page = await classrooms.listPlaySessions(
        childId,
        [
          {
            startedAt: new Date('2026-09-01T00:00:00.000Z'),
            endedAt: new Date('2026-11-01T00:00:00.000Z'),
          },
        ],
        1,
        20,
      );
      expect(page.total).toBe(2);
      expect(
        page.rows.map((row) => row.startedAt.toISOString().slice(0, 10)),
      ).toEqual(['2026-10-10', '2026-09-10']);
    });

    it('places a child without a class and lists unassigned children', async () => {
      const { childId } = await prisma.child.create({
        data: profile,
        select: { childId: true },
      });
      try {
        const before = await classrooms.listUnassignedChildren();
        expect(before.map((row) => row.childId)).toContain(childId);
        await classrooms.enroll(childId, classA, new Date());
        const after = await classrooms.listUnassignedChildren();
        expect(after.map((row) => row.childId)).not.toContain(childId);
        await expect(
          classrooms.enroll(childId, classB, new Date()),
        ).rejects.toMatchObject({ code: 'P2002' });
      } finally {
        await prisma.classroomEnrollment.deleteMany({ where: { childId } });
        await prisma.child.delete({ where: { childId } });
      }
    });

    it('replacing a login code revokes the child sessions', async () => {
      const { childId } = await classrooms.createChild(
        profile,
        classA,
        new Date(),
      );
      const token = newRefreshToken();
      await childAuth.createSession(
        childId,
        token,
        new Date(Date.now() + 3600_000),
      );
      const digest = 'a'.repeat(64);
      expect(
        await childAuth.replaceLoginCode(childId, digest, new Date()),
      ).toBe(true);
      expect(await childAuth.findByCodeDigest(digest)).toMatchObject({
        childId,
      });
      const session = await childAuth.findToken(token.tokenId);
      expect(session?.session.revokedAt).not.toBeNull();
      await prisma.childAuthSession.deleteMany({ where: { childId } });
    });
  },
);
