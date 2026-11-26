import { adminChildQuerySchema } from '@lumikids/shared';
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

    it('lists only the school play sessions started inside the given periods', async () => {
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
      // Inside the period too: school work is listed, home practice stays with the family.
      for (const [startedAt, context] of [['2026-10-15', 'SCHOOL'], ['2026-10-20', 'HOME']] as const)
        await prisma.playSession.create({
          data: {
            childId,
            versionId: version.versionId,
            startRequestId: randomUUID(),
            startedAt: new Date(`${startedAt}T08:00:00.000Z`),
            context,
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
      expect(page.total).toBe(3);
      expect(
        page.rows.map((row) => row.startedAt.toISOString().slice(0, 10)),
      ).toEqual(['2026-10-15', '2026-10-10', '2026-09-10']);
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

    it('issues a first login code once under concurrent requests and checks the class and teacher', async () => {
      const { childId } = await classrooms.createChild(profile, classA, new Date());
      const teacher = await prisma.user.create({
        data: { fullName: 'Teacher', email: `${randomUUID()}@example.test`, address: '', passwordHash: 'fixture', phone: '' },
      });
      fixtures.push(async () => {
        await prisma.classroomTeacher.deleteMany({ where: { userId: teacher.userId } });
        await prisma.user.delete({ where: { userId: teacher.userId } });
      });
      await prisma.classroomTeacher.create({ data: { classId: classA, userId: teacher.userId } });
      const now = new Date();
      await expect(childAuth.insertFirstClassCode(childId, classA, randomUUID(), 'a'.repeat(64), now)).resolves.toBe('NOT_ELIGIBLE');
      await expect(childAuth.insertFirstClassCode(childId, classB, teacher.userId, 'a'.repeat(64), now)).resolves.toBe('NOT_ELIGIBLE');
      const codes = await Promise.all(['a', 'b'].map((character) =>
        childAuth.insertFirstClassCode(childId, classA, teacher.userId, character.repeat(64), now),
      ));
      expect(codes.sort()).toEqual(['NOT_ELIGIBLE', 'SAVED']);
      const current = await prisma.child.findUniqueOrThrow({ where: { childId } });
      await expect(childAuth.insertFirstClassCode(childId, classA, teacher.userId, 'c'.repeat(64), now)).resolves.toBe('NOT_ELIGIBLE');
      expect((await prisma.child.findUniqueOrThrow({ where: { childId } })).loginCodeDigest).toBe(current.loginCodeDigest);
    });

    it('places school children and leaves family profiles for consented enrollment', async () => {
      const school = await prisma.child.create({ data: profile });
      const home = await prisma.child.create({ data: profile });
      const guardian = await prisma.user.create({
        data: {
          fullName: 'Guardian', email: `${randomUUID()}@example.test`, address: '', passwordHash: 'fixture', phone: '',
          guardianProfile: { create: { relationship: 'MOTHER', children: { create: { childId: home.childId } } } },
        },
      });
      fixtures.push(async () => {
        await prisma.user.delete({ where: { userId: guardian.userId } });
        await prisma.child.delete({ where: { childId: home.childId } });
      });
      await expect(classrooms.placeSchoolChild(home.childId, classA, new Date())).resolves.toBe('FAMILY_PROFILE');
      await expect(classrooms.placeSchoolChild(school.childId, classA, new Date())).resolves.toBe('COMPLETED');
      await expect(classrooms.placeSchoolChild(school.childId, classB, new Date())).resolves.toBe('HAS_CLASS');
      expect(await classrooms.findCurrentEnrollment(home.childId)).toBeNull();
      // The directory filters run in the database.
      const page = (value: object) => classrooms.pageChildren(adminChildQuerySchema.parse(value));
      const inA = await page({ classId: classA });
      expect(inA.rows.map((row) => row.childId)).toEqual([school.childId]);
      expect(inA.rows[0].enrollments[0].classroom.classId).toBe(classA);
      const family = await page({ classId: 'none', managed: 'FAMILY' });
      expect(family.rows.map((row) => row.childId)).toContain(home.childId);
      expect(family.rows.map((row) => row.childId)).not.toContain(school.childId);
      expect((await page({ classId: classA, pageSize: 1, page: 2 })).rows).toHaveLength(0);
      expect(await classrooms.childIds(adminChildQuerySchema.parse({ classId: classA }), 10)).toEqual([
        { childId: school.childId, fullName: profile.fullName, status: 'ACTIVE', classId: classA, managedByFamily: false },
      ]);
      expect((await classrooms.findCurrentEnrollment(school.childId))?.classId).toBe(classA);
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
