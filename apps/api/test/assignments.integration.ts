import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ClassroomsRepository } from '../src/modules/classrooms/classrooms.repository.js';
import { AssignmentsRepository } from '../src/modules/learning-content/assignments.repository.js';
import { recipientProgress } from '../src/modules/learning-content/assignment-progress.js';
import { PrismaPlaySessionRepository } from '../src/modules/gameplay/infrastructure/prisma-play-session.repository.js';

const testUrl = process.env.TEST_DATABASE_URL;

// Never falls back to DATABASE_URL or applies migrations automatically.
describe.skipIf(!testUrl)(
  'Assignments with real PostgreSQL (explicit test DB only)',
  () => {
    let prisma: PrismaService;
    let classrooms: ClassroomsRepository;
    let assignments: AssignmentsRepository;
    const cleanups: (() => Promise<unknown>)[] = [];
    let ids: {
      userId: string;
      classId: string;
      schoolYearId: string;
      versionId: string;
      activityId: string;
      childIds: string[];
    };

    beforeAll(async () => {
      if (!testUrl) throw new Error('TEST_DATABASE_URL is required.');
      const url = new URL(testUrl);
      const database = decodeURIComponent(url.pathname.slice(1));
      if (
        !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
        !database.endsWith('_test') ||
        database === 'lumikids_db'
      )
        throw new Error(
          'Integration tests require a local dedicated database whose name ends in _test.',
        );
      prisma = new PrismaService({ url: testUrl });
      classrooms = new ClassroomsRepository(prisma);
      assignments = new AssignmentsRepository(prisma);
      await prisma.onModuleInit();
    });
    beforeEach(async () => {
      const user = await prisma.user.create({
        data: {
          email: `${randomUUID()}@example.test`,
          fullName: 'Teacher',
          phone: '',
          address: '',
          passwordHash: 'x',
        },
      });
      const year = await classrooms.createSchoolYear({
        name: `Fixture ${randomUUID()}`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-05-31T00:00:00.000Z'),
      });
      const { classId } = await classrooms.createClassroom({
        className: 'A',
        schoolYearId: year.schoolYearId,
        ageGroupId: 'AGE_5_6',
      });
      const profile = {
        fullName: 'Child',
        dob: new Date('2021-05-01T00:00:00.000Z'),
        gender: 'MALE' as const,
      };
      const childIds = [
        (
          await classrooms.createChild(
            profile,
            classId,
            new Date('2026-09-05T00:00:00.000Z'),
          )
        ).childId,
        (
          await classrooms.createChild(
            profile,
            classId,
            new Date('2026-09-05T00:00:00.000Z'),
          )
        ).childId,
      ];
      const activity = await prisma.activity.create({
        data: {
          name: 'Game',
          createdBy: user.userId,
          ageGroupId: 'AGE_5_6',
          saveRequestId: randomUUID(),
          saveFingerprint: '0'.repeat(64),
        },
      });
      const v = await prisma.activityVersion.create({
        data: {
          activityId: activity.activityId,
          versionNumber: 1,
          instruction: 'x',
          difficulty: 'EASY',
          gameType: 'COUNTING',
          content: {},
          completionRule: 'CORRECT_CHOICE',
        },
      });
      ids = {
        userId: user.userId,
        classId,
        schoolYearId: year.schoolYearId,
        versionId: v.versionId,
        activityId: activity.activityId,
        childIds,
      };
    });
    afterEach(async () => {
      for (const cleanup of cleanups.splice(0)) await cleanup();
      await prisma.playSession.deleteMany({
        where: { childId: { in: ids.childIds } },
      });
      await prisma.activityAssignment.deleteMany({
        where: { OR: [{ classId: ids.classId }, { createdBy: ids.userId }] },
      });
      await prisma.classroomEnrollment.deleteMany({
        where: { classId: ids.classId },
      });
      await prisma.child.deleteMany({
        where: { childId: { in: ids.childIds } },
      });
      await prisma.classroom.delete({ where: { classId: ids.classId } });
      await prisma.schoolYear.delete({
        where: { schoolYearId: ids.schoolYearId },
      });
      await prisma.activityVersion.delete({
        where: { versionId: ids.versionId },
      });
      await prisma.activity.delete({ where: { activityId: ids.activityId } });
      await prisma.user.delete({ where: { userId: ids.userId } });
    });
    afterAll(async () => {
      await prisma?.onModuleDestroy();
    });

    const create = (dueAt: Date | null, childIds = ids.childIds) =>
      assignments.create({
        classId: ids.classId,
        title: 'Bài',
        note: '',
        createdBy: ids.userId,
        opensAt: new Date('2026-11-10T00:00:00.000Z'),
        dueAt,
        targetType: 'CLASS',
        targetLabel: 'Cả lớp',
        versionIds: [ids.versionId],
        childIds,
      });

    it('creates items and one recipient per child; the database rejects a deadline before opening', async () => {
      const assignmentId = await create(new Date('2026-11-15T00:00:00.000Z'));
      const row = await assignments.find(ids.classId, assignmentId);
      expect(row?.items.map((item) => item.version.versionId)).toEqual([
        ids.versionId,
      ]);
      expect(row?.recipients).toHaveLength(2);
      await expect(
        create(new Date('2026-11-01T00:00:00.000Z')),
      ).rejects.toBeDefined();
    });

    it('links completion to the selected assignment and rejects a child outside its recipients', async () => {
      const [childId, otherChildId] = ids.childIds;
      const first = await create(null, [childId]);
      const second = await create(null, [childId]);
      const plays = new PrismaPlaySessionRepository(prisma);
      const start = {
        childId,
        assignmentId: first,
        versionId: ids.versionId,
        startRequestId: randomUUID(),
        context: 'SCHOOL' as const,
        ageGroup: '5-6',
        difficulty: 'EASY' as const,
        hintLimitPerTask: 1,
      };

      expect(await assignments.findRecipientGame(childId, first, ids.versionId))
        .toMatchObject({
          child: { dob: new Date('2021-05-01T00:00:00.000Z') },
          assignment: { items: [{ version: { versionId: ids.versionId } }] },
        });
      await expect(plays.start({ ...start, childId: otherChildId }))
        .rejects.toMatchObject({ code: 'P2003' });
      const play = await plays.start(start);
      expect(await prisma.playSession.update({
        where: { sessionId: play.sessionId },
        data: { status: 'COMPLETED', endedAt: new Date() },
      })).toMatchObject({
        assignmentId: first,
        context: 'SCHOOL',
        ageGroup: '5-6',
        difficulty: 'EASY',
        hintLimitPerTask: 1,
      });
      const since = new Date(0);
      const versions = [ids.versionId];
      const sessions = await assignments.sessions([childId], versions, since);
      expect(recipientProgress(versions, since, sessions, first).completionStatus).toBe('COMPLETED');
      expect(recipientProgress(versions, since, sessions, second).completionStatus).toBe('NOT_STARTED');
    });

    it('keeps one pending replay request per child and approves it once', async () => {
      const assignmentId = await create(new Date('2026-11-11T00:00:00.000Z'));
      const recipient = await assignments.findRecipient(
        ids.childIds[0],
        assignmentId,
      );
      if (!recipient) throw new Error('recipient missing');
      const [first, second] = await Promise.all([
        assignments.requestReplay(recipient.recipientId),
        assignments.requestReplay(recipient.recipientId),
      ]);
      expect(first.requestedAt).toEqual(second.requestedAt);
      expect(
        await prisma.replayRequest.count({
          where: { recipientId: recipient.recipientId },
        }),
      ).toBe(1);
      const request = await prisma.replayRequest.findFirstOrThrow({
        where: { recipientId: recipient.recipientId },
      });
      const until = new Date('2026-12-01T00:00:00.000Z');
      const decision = {
        approve: true,
        until,
        decidedBy: ids.userId,
        now: new Date(),
      };
      const outcomes = await Promise.all([
        assignments.decide(
          { requestId: request.requestId, recipientId: recipient.recipientId },
          decision,
        ),
        assignments.decide(
          { requestId: request.requestId, recipientId: recipient.recipientId },
          decision,
        ),
      ]);
      expect(outcomes.filter(Boolean)).toHaveLength(1);
      const after = await assignments.findRecipient(
        ids.childIds[0],
        assignmentId,
      );
      expect(after?.extendedUntil).toEqual(until);
      // A new request is possible once the previous one is decided.
      await assignments.requestReplay(recipient.recipientId);
      expect(
        await prisma.replayRequest.count({
          where: { recipientId: recipient.recipientId },
        }),
      ).toBe(2);
    });

    it("lists the child's opened assignments of the given class only", async () => {
      await create(null);
      const rows = await assignments.forChild(
        ids.childIds[0],
        ids.classId,
        new Date('2026-11-12T00:00:00.000Z'),
      );
      expect(rows).toHaveLength(1);
      expect(
        await assignments.forChild(
          ids.childIds[0],
          ids.classId,
          new Date('2026-11-09T00:00:00.000Z'),
        ),
      ).toHaveLength(0);
      expect(
        await assignments.forChild(
          ids.childIds[0],
          randomUUID(),
          new Date('2026-11-12T00:00:00.000Z'),
        ),
      ).toHaveLength(0);
    });

    it('adds home practice to the class work of a child in a class', async () => {
      const classWork = await create(null);
      const homeWork = await assignments.create({
        source: 'GUARDIAN',
        classId: null,
        title: 'Ở nhà',
        note: '',
        createdBy: ids.userId,
        opensAt: new Date('2026-11-10T00:00:00.000Z'),
        dueAt: null,
        targetType: 'CHILDREN',
        targetLabel: 'Phụ huynh chọn',
        versionIds: [ids.versionId],
        childIds: [ids.childIds[0]],
      });
      const at = new Date('2026-11-12T00:00:00.000Z');
      const inClass = await assignments.forChild(ids.childIds[0], ids.classId, at);
      expect(inClass.map((row) => row.assignment.assignmentId).sort()).toEqual(
        [classWork, homeWork].sort(),
      );
      // Moved to another class: the old class's work disappears, home practice stays.
      const elsewhere = await assignments.forChild(ids.childIds[0], randomUUID(), at);
      expect(elsewhere.map((row) => row.assignment.assignmentId)).toEqual([homeWork]);
    });
  },
);
