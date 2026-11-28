import { createClassroomSchema } from '@lumikids/shared';
import type { AuditService } from '../audit/audit.service.js';
import type { ChildAuthService } from '../auth/child-auth.service.js';
import type { ClassroomsRepository } from './classrooms.repository.js';
import { ClassroomsService } from './classrooms.service.js';

const classId = '6f1f7d7a-3e1c-4f5a-9d1e-0a1b2c3d4e5f';
const teacherA = '11111111-1111-4111-8111-111111111111';
const teacherB = '22222222-2222-4222-8222-222222222222';

function setup(teachers: string[]) {
  const repository = {
    findClassroom: vi.fn(() => Promise.resolve({ classId, status: 'ACTIVE' })),
    teacherIds: vi.fn(() => Promise.resolve(teachers)),
    removeTeacher: vi.fn(() => Promise.resolve()),
  };
  const service = new ClassroomsService(
    repository as unknown as ClassroomsRepository,
    {} as unknown as ChildAuthService,
    { record: vi.fn(() => Promise.resolve()) } as unknown as AuditService,
    { devMode: false } as never,
  );
  return { service, repository };
}

describe('class must keep a responsible teacher', () => {
  it('refuses to remove the last teacher of a class', async () => {
    const { service, repository } = setup([teacherA]);
    await expect(service.removeTeacher(classId, teacherA)).rejects.toMatchObject({ publicCode: 'CLASSROOM_NEEDS_TEACHER' });
    expect(repository.removeTeacher).not.toHaveBeenCalled();
  });

  it('allows removing one teacher while another still teaches the class', async () => {
    const { service, repository } = setup([teacherA, teacherB]);
    await service.removeTeacher(classId, teacherA).catch(() => undefined);
    expect(repository.removeTeacher).toHaveBeenCalledWith(classId, teacherA);
  });

  it('does not accept a class created without any teacher', () => {
    const base = { className: 'Lá 1', schoolYearId: classId, ageGroupId: 'AG1' };
    expect(createClassroomSchema.safeParse(base).success).toBe(false);
    expect(createClassroomSchema.safeParse({ ...base, teacherUserIds: [teacherA] }).success).toBe(true);
  });
});
