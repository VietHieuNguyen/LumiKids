import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ClassroomsRepository } from '../src/modules/classrooms/classrooms.repository.js';
import { TeacherAssessmentsRepository } from '../src/modules/classrooms/teacher-assessments.repository.js';

const testUrl = process.env.TEST_DATABASE_URL;

// Never falls back to DATABASE_URL or applies migrations automatically.
describe.skipIf(!testUrl)(
  'Teacher assessments with real PostgreSQL (explicit test DB only)',
  () => {
    let prisma: PrismaService;
    let classrooms: ClassroomsRepository;
    let notes: TeacherAssessmentsRepository;
    const cleanups: (() => Promise<unknown>)[] = [];

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
      notes = new TeacherAssessmentsRepository(prisma);
      await prisma.onModuleInit();
    });
    afterEach(async () => {
      for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
    });
    afterAll(async () => {
      await prisma?.onModuleDestroy();
    });

    async function fixture() {
      const teacher = await prisma.user.create({
        data: {
          email: `${randomUUID()}@example.test`,
          fullName: 'Cô Test',
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
      await classrooms.addTeacher(classId, teacher.userId);
      const child = await classrooms.createChild(
        { fullName: 'Bé', dob: new Date('2021-05-01T00:00:00.000Z'), gender: 'MALE' },
        classId,
        new Date('2026-09-05T00:00:00.000Z'),
      );
      cleanups.push(async () => {
        await prisma.teacherAssessment.deleteMany({ where: { childId: child.childId } });
        await prisma.classroomEnrollment.deleteMany({ where: { classId } });
        await prisma.classroomTeacher.deleteMany({ where: { classId } });
        await prisma.child.delete({ where: { childId: child.childId } });
        await prisma.classroom.delete({ where: { classId } });
        await prisma.schoolYear.delete({ where: { schoolYearId: year.schoolYearId } });
        await prisma.user.delete({ where: { userId: teacher.userId } });
      });
      return { teacherId: teacher.userId, classId, childId: child.childId };
    }

    const base = (childId: string, classId: string, authorId: string) => ({
      childId,
      classId,
      authorId,
      criterionCode: '43',
      periodStart: new Date('2026-11-01T00:00:00.000Z'),
      periodEnd: new Date('2026-11-30T00:00:00.000Z'),
      content: 'Bé đếm đến 10 đúng.',
    });

    it('keeps a draft as draft until published; every edit of a published note is revisioned', async () => {
      const { teacherId, classId, childId } = await fixture();
      const created = await notes.create(base(childId, classId, teacherId));
      expect(created.status).toBe('DRAFT');
      expect(created._count.revisions).toBe(0);

      expect(await notes.publish(created.assessmentId, new Date())).toBe(true);
      expect(await notes.publish(created.assessmentId, new Date())).toBe(false);

      await notes.update(
        created.assessmentId,
        { content: 'Bé đếm đến 20 đúng.' },
        {
          changedBy: teacherId,
          reason: 'Bổ sung sau buổi quan sát',
          previous: { criterionCode: '43', periodStart: created.periodStart, periodEnd: created.periodEnd, content: created.content, status: 'PUBLISHED' },
        },
      );
      const history = await notes.revisions(created.assessmentId);
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        revisionNo: 1,
        reason: 'Bổ sung sau buổi quan sát',
        previous: { content: 'Bé đếm đến 10 đúng.', status: 'PUBLISHED' },
      });
    });

    it('deletes drafts only', async () => {
      const { teacherId, classId, childId } = await fixture();
      const draft = await notes.create(base(childId, classId, teacherId));
      expect(await notes.deleteDraft(draft.assessmentId)).toBe(true);

      const published = await notes.create(base(childId, classId, teacherId));
      await notes.publish(published.assessmentId, new Date());
      expect(await notes.deleteDraft(published.assessmentId)).toBe(false);
      expect(await notes.find(childId, published.assessmentId)).not.toBeNull();
    });

    it('rejects a criterion outside 42–52 and a period that ends before it starts, in the database itself', async () => {
      const { teacherId, classId, childId } = await fixture();
      await expect(notes.create({ ...base(childId, classId, teacherId), criterionCode: '41' })).rejects.toBeDefined();
      await expect(notes.create({ ...base(childId, classId, teacherId), criterionCode: '53' })).rejects.toBeDefined();
      await expect(
        notes.create({
          ...base(childId, classId, teacherId),
          periodStart: new Date('2026-12-01T00:00:00.000Z'),
          periodEnd: new Date('2026-11-01T00:00:00.000Z'),
        }),
      ).rejects.toBeDefined();
    });
  },
);
