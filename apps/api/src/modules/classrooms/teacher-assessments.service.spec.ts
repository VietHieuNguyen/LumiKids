import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import type { Principal } from '../../common/security/principal.js';
import type { ClassroomsRepository } from './classrooms.repository.js';
import type { ClassroomsService } from './classrooms.service.js';
import type { TeacherAssessmentsRepository } from './teacher-assessments.repository.js';
import { TeacherAssessmentsService } from './teacher-assessments.service.js';

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

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    assessmentId: randomUUID(),
    childId: randomUUID(),
    classId: randomUUID(),
    authorId: teacher.userId,
    criterionCode: '43',
    periodStart: new Date('2026-11-01T00:00:00.000Z'),
    periodEnd: new Date('2026-11-30T00:00:00.000Z'),
    content: 'Bé đếm đến 10 đúng.',
    status: 'DRAFT',
    publishedAt: null,
    createdAt: new Date('2026-11-28T01:00:00.000Z'),
    updatedAt: new Date('2026-11-28T01:00:00.000Z'),
    author: { fullName: 'Cô Lan' },
    _count: { revisions: 0 },
    ...overrides,
  };
}

function setup(options: { inClass?: boolean; enrolledIn?: string | null; note?: ReturnType<typeof row> | null }) {
  const classId = randomUUID();
  const childId = randomUUID();
  const current = options.note === undefined ? row({ classId, childId }) : options.note;
  const classrooms = { requireTeacherOf: vi.fn((): Promise<void> => (options.inClass === false ? Promise.reject(new NotFoundException()) : Promise.resolve())) };
  const enrollments = {
    findCurrentEnrollment: vi.fn(() =>
      Promise.resolve(options.enrolledIn === null ? null : { classId: options.enrolledIn ?? classId, startedAt: new Date() }),
    ),
  };
  const repository = {
    list: vi.fn(() => Promise.resolve([current].filter(Boolean))),
    find: vi.fn(() => Promise.resolve(current)),
    revisions: vi.fn(() => Promise.resolve([])),
    create: vi.fn((data: Record<string, unknown>) => Promise.resolve(row({ ...data, status: 'DRAFT' }))),
    update: vi.fn((id: string, patch: Record<string, unknown>) => Promise.resolve(row({ ...current, ...patch, assessmentId: id }))),
    publish: vi.fn(() => Promise.resolve(true)),
    deleteDraft: vi.fn(() => Promise.resolve(true)),
  };
  const service = new TeacherAssessmentsService(
    repository as unknown as TeacherAssessmentsRepository,
    classrooms as unknown as ClassroomsService,
    enrollments as unknown as ClassroomsRepository,
  );
  return { service, repository, classId, childId, current };
}

describe('TeacherAssessmentsService (FR-3.1)', () => {
  it('answers 404 for a teacher outside the class', async () => {
    const { service, classId, childId } = setup({ inClass: false });
    await expect(service.list(teacher, classId, childId)).rejects.toThrow(NotFoundException);
  });

  it('answers 404 when the child is no longer enrolled in that class', async () => {
    const { service, classId, childId } = setup({ enrolledIn: randomUUID() });
    await expect(service.list(teacher, classId, childId)).rejects.toThrow(NotFoundException);
    const none = setup({ enrolledIn: null });
    await expect(none.service.create(teacher, none.classId, none.childId, {
      criterionCode: '43', periodStart: '2026-11-01', periodEnd: '2026-11-30', content: 'x',
    })).rejects.toThrow(NotFoundException);
  });

  it('creates a draft that stores the author and the class the child is in', async () => {
    const { service, repository, classId, childId } = setup({});
    const created = await service.create(teacher, classId, childId, {
      criterionCode: '43', periodStart: '2026-11-01', periodEnd: '2026-11-30', content: 'Bé đếm đến 10.',
    });
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ classId, childId, authorId: teacher.userId }));
    expect(created.status).toBe('DRAFT');
  });

  it('refuses an edit of a published note without a reason, and keeps the replaced values when given one', async () => {
    const published = row({ status: 'PUBLISHED', publishedAt: new Date() });
    const { service, repository, classId, childId } = setup({ note: published });
    await expect(service.update(teacher, classId, childId, published.assessmentId, { content: 'Mới' }))
      .rejects.toMatchObject({ publicCode: 'ASSESSMENT_REASON_REQUIRED' });
    expect(repository.update).not.toHaveBeenCalled();

    await service.update(teacher, classId, childId, published.assessmentId, { content: 'Mới', reason: 'Bổ sung sau quan sát' });
    expect(repository.update).toHaveBeenCalledWith(
      published.assessmentId,
      { content: 'Mới' },
      expect.objectContaining({ reason: 'Bổ sung sau quan sát', previous: expect.objectContaining({ content: published.content, status: 'PUBLISHED' }) }),
    );
  });

  it('edits a draft without a reason', async () => {
    const { service, repository, classId, childId, current } = setup({});
    await service.update(teacher, classId, childId, current!.assessmentId, { content: 'Sửa nháp' });
    expect(repository.update).toHaveBeenCalledOnce();
  });

  it('rejects a period that ends before it starts', async () => {
    const { service, classId, childId, current } = setup({});
    await expect(service.update(teacher, classId, childId, current!.assessmentId, { periodStart: '2026-12-02' }))
      .rejects.toMatchObject({ publicCode: 'ASSESSMENT_PERIOD_INVALID' });
  });

  it('publishes only a draft, once', async () => {
    const { service, repository, classId, childId, current } = setup({});
    repository.publish.mockResolvedValueOnce(false);
    await expect(service.publish(teacher, classId, childId, current!.assessmentId))
      .rejects.toMatchObject({ publicCode: 'ASSESSMENT_NOT_DRAFT' });
  });

  it('deletes drafts only; a published note stays', async () => {
    const draft = setup({});
    await expect(draft.service.remove(teacher, draft.classId, draft.childId, draft.current!.assessmentId)).resolves.toEqual({ deleted: true });

    const published = setup({ note: row({ status: 'PUBLISHED' }) });
    await expect(published.service.remove(teacher, published.classId, published.childId, published.current!.assessmentId))
      .rejects.toMatchObject({ publicCode: 'ASSESSMENT_PUBLISHED_NOT_DELETABLE' });
    expect(published.repository.deleteDraft).not.toHaveBeenCalled();
  });

  it('returns 404 for a note that belongs to another child', async () => {
    const { service, classId, childId } = setup({ note: null });
    await expect(service.detail(teacher, classId, childId, randomUUID())).rejects.toThrow(NotFoundException);
  });

  it('shows a parent only published notes, never drafts', async () => {
    const { service, repository, childId } = setup({});
    repository.list.mockResolvedValueOnce([
      row({ status: 'DRAFT', content: 'nháp' }),
      row({ status: 'PUBLISHED', content: 'đã phát hành' }),
    ] as never);
    const visible = await service.listPublished(childId);
    expect(visible.map((note) => note.content)).toEqual(['đã phát hành']);
    expect(visible[0]).not.toHaveProperty('revisions');
  });
});
