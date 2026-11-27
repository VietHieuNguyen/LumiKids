import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { randomBytes, randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { UsersService } from '../src/modules/users/users.service.js';
import { ChildAuthService } from '../src/modules/auth/child-auth.service.js';
import { ClassroomsService } from '../src/modules/classrooms/classrooms.service.js';
import { AssignmentsService } from '../src/modules/learning-content/assignments.service.js';
import { TeacherAssessmentsService } from '../src/modules/classrooms/teacher-assessments.service.js';
import { configureHttp } from '../src/common/http/configure-http.js';
import {
  stubStorageEnvironment,
  teacherFixture,
} from './game-asset.fixtures.js';
import type {
  ChildPrincipal,
  Principal,
} from '../src/common/security/principal.js';

describe('Classrooms HTTP contract (offline; service mocked)', () => {
  let app: INestApplication;
  let actor: Principal;
  const secret = randomBytes(48).toString('base64url');
  const teacher: Principal = {
    ...teacherFixture,
    permissions: [
      'READ_OWN_ACCOUNT',
      'READ_OWN_CLASSROOMS',
      'RESET_CHILD_LOGIN_CODES',
    ],
  };
  const admin: Principal = {
    ...teacherFixture,
    userId: randomUUID(),
    roles: ['ROLE_ADMIN'],
    permissions: ['READ_OWN_ACCOUNT', 'MANAGE_CLASSROOMS'],
  };
  const child: ChildPrincipal = {
    childId: randomUUID(),
    fullName: 'Bé An',
    permissions: ['PLAY_GAMES'],
  };
  const assessments = {
    list: vi.fn(() => Promise.resolve([])),
    create: vi.fn(() => Promise.resolve({})),
    detail: vi.fn(() => Promise.resolve({})),
    update: vi.fn(() => Promise.resolve({})),
    publish: vi.fn(() => Promise.resolve({})),
    remove: vi.fn(() => Promise.resolve({ deleted: true })),
  };
  const classrooms = {
    listClassrooms: vi.fn(() => Promise.resolve([])),
    createChild: vi.fn(() => Promise.resolve({})),
    issueInitialCodes: vi.fn(() => Promise.resolve({ issued: [], skipped: [] })),
    enrollSchoolChildren: vi.fn(() => Promise.resolve({ completedIds: [], skipped: [] })),
    pageChildren: vi.fn(() => Promise.resolve({ items: [], total: 0, counts: { all: 0, unassigned: 0, withoutCode: 0, disabled: 0 } })),
    childIds: vi.fn(() => Promise.resolve({ items: [], truncated: false })),
    setChildrenStatus: vi.fn(() => Promise.resolve({ completedIds: [], skipped: [] })),
    teacherClassrooms: vi.fn(() => Promise.resolve([])),
    classPlayHistory: vi.fn(() =>
      Promise.resolve({
        items: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      }),
    ),
    issueLoginCode: vi.fn(() =>
      Promise.resolve({
        childId: child.childId,
        code: 'K7MQ-2HXA',
        issuedAt: new Date().toISOString(),
      }),
    ),
  };

  const assignments = {
    list: vi.fn(() => Promise.resolve([])),
    adminList: vi.fn(() => Promise.resolve([])),
    create: vi.fn(() => Promise.resolve({})),
    forChild: vi.fn(() => Promise.resolve([])),
    playableVersionIds: vi.fn(() => Promise.resolve(new Set())),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    stubStorageEnvironment();
    vi.stubEnv('JWT_ACCESS_SECRET', secret);
    vi.stubEnv('AUTH_ALLOWED_ORIGINS', 'http://localhost:3000');
    vi.stubEnv(
      'DATABASE_URL',
      'postgresql://fixture:fixture@localhost:5433/fixture',
    );
    actor = teacher;
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(UsersService)
      .useValue({ requireActivePrincipal: () => Promise.resolve(actor) })
      .overrideProvider(ChildAuthService)
      .useValue({ requireActiveChild: () => Promise.resolve(child) })
      .overrideProvider(ClassroomsService)
      .useValue(classrooms)
      .overrideProvider(TeacherAssessmentsService)
      .useValue(assessments)
      .overrideProvider(AssignmentsService)
      .useValue(assignments)
      .compile();
    app = module.createNestApplication();
    configureHttp(app);
    await app.init();
  });
  afterEach(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });
  const token = (kind: 'adult' | 'child' = 'adult') =>
    app.get(JwtService).signAsync(
      { tokenUse: kind === 'child' ? 'child_access' : 'access' },
      {
        secret,
        algorithm: 'HS256',
        subject: kind === 'child' ? child.childId : actor.userId,
        issuer: 'lumikids-api',
        audience: 'lumikids-web',
        expiresIn: 900,
        jwtid: randomUUID(),
      },
    );

  it('keeps administration for MANAGE_CLASSROOMS only', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/classrooms')
      .auth(await token(), { type: 'bearer' })
      .expect(403);
    actor = admin;
    await request(app.getHttpServer())
      .get('/api/v1/admin/classrooms')
      .auth(await token(), { type: 'bearer' })
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/teacher/classrooms')
      .auth(await token(), { type: 'bearer' })
      .expect(403);
  });

  it('lets an admin read results and assignments of any class, read-only', async () => {
    const classId = randomUUID();
    const childId = randomUUID();
    const history = `/api/v1/admin/classrooms/${classId}/children/${childId}/play-sessions`;
    const assigned = `/api/v1/admin/classrooms/${classId}/assignments`;
    // A teacher (no MANAGE_CLASSROOMS) cannot use the admin views, even for their own class.
    for (const path of [history, assigned])
      await request(app.getHttpServer())
        .get(path)
        .auth(await token(), { type: 'bearer' })
        .expect(403);
    actor = admin;
    await request(app.getHttpServer())
      .get(`${history}?page=1&pageSize=20`)
      .auth(await token(), { type: 'bearer' })
      .expect(200);
    expect(classrooms.classPlayHistory).toHaveBeenCalledWith(classId, childId, {
      page: 1,
      pageSize: 20,
    });
    await request(app.getHttpServer())
      .get(assigned)
      .auth(await token(), { type: 'bearer' })
      .expect(200);
    expect(assignments.adminList).toHaveBeenCalledWith(classId);
    // Changing an assignment stays a teacher action.
    await request(app.getHttpServer())
      .patch(`${assigned}/${randomUUID()}`)
      .auth(await token(), { type: 'bearer' })
      .send({ status: 'CANCELLED' })
      .expect(404);
  });

  it('refuses children on classroom routes', async () => {
    for (const path of [
      '/api/v1/admin/classrooms',
      '/api/v1/teacher/classrooms',
    ])
      await request(app.getHttpServer())
        .get(path)
        .auth(await token('child'), { type: 'bearer' })
        .expect(403);
  });

  it('validates the new child before reaching the service', async () => {
    actor = admin;
    await request(app.getHttpServer())
      .post('/api/v1/admin/children')
      .auth(await token(), { type: 'bearer' })
      .send({
        fullName: 'Bé An',
        dob: '2999-01-01',
        gender: 'MALE',
        classId: randomUUID(),
      })
      .expect(400);
    expect(classrooms.createChild).not.toHaveBeenCalled();
  });

  it('returns a new login code once, never cached', async () => {
    const classId = randomUUID();
    const response = await request(app.getHttpServer())
      .post(
        `/api/v1/teacher/classrooms/${classId}/children/${child.childId}/login-code`,
      )
      .auth(await token(), { type: 'bearer' })
      .expect(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.data).toMatchObject({ code: 'K7MQ-2HXA' });
    expect(classrooms.issueLoginCode).toHaveBeenCalledWith(
      expect.objectContaining({ userId: teacher.userId }),
      classId,
      child.childId,
    );
  });

  it('protects and validates batch issuance and disables response caching', async () => {
    const classId = randomUUID();
    const path = `/api/v1/teacher/classrooms/${classId}/children/initial-login-codes`;
    const headers = { type: 'bearer' as const };
    const payload = { childIds: [child.childId] };
    actor = { ...teacher, permissions: ['READ_OWN_CLASSROOMS'] };
    await request(app.getHttpServer()).post(path).auth(await token(), headers).send(payload).expect(403);
    actor = teacher;
    await request(app.getHttpServer()).post(path).auth(await token(), headers)
      .send({ childIds: [child.childId, child.childId] }).expect(400);
    await request(app.getHttpServer()).post(path).auth(await token(), headers)
      .send(payload).expect(201).expect('Cache-Control', 'no-store');
    expect(classrooms.issueInitialCodes).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ userId: teacher.userId }), classId, [child.childId],
    );
  });

  it('restricts school batch enrollment to administrators', async () => {
    const classId = randomUUID();
    const path = '/api/v1/admin/children/enrollments/batch';
    const payload = { classId, childIds: [child.childId] };
    await request(app.getHttpServer()).post(path).auth(await token(), { type: 'bearer' }).send(payload).expect(403);
    actor = admin;
    await request(app.getHttpServer()).post(path).auth(await token(), { type: 'bearer' }).send(payload).expect(200);
    expect(classrooms.enrollSchoolChildren).toHaveBeenCalledExactlyOnceWith(classId, [child.childId]);
  });

  it('lists every child and locks children in bulk for administrators only', async () => {
    const auth = { type: 'bearer' as const };
    const statusPath = '/api/v1/admin/children/status/batch';
    await request(app.getHttpServer()).get('/api/v1/admin/children').auth(await token(), auth).expect(403);
    actor = admin;
    await request(app.getHttpServer()).get('/api/v1/admin/children?classId=none&sort=dob&dir=desc&page=2').auth(await token(), auth).expect(200);
    expect(classrooms.pageChildren).toHaveBeenCalledWith(expect.objectContaining({ classId: 'none', sort: 'dob', dir: 'desc', page: 2, pageSize: 25 }));
    await request(app.getHttpServer()).get('/api/v1/admin/children?pageSize=500').auth(await token(), auth).expect(400);
    await request(app.getHttpServer()).get('/api/v1/admin/children/ids?code=NONE').auth(await token(), auth).expect(200);
    expect(classrooms.childIds).toHaveBeenCalledWith(expect.objectContaining({ code: 'NONE' }));
    await request(app.getHttpServer()).post(statusPath).auth(await token(), auth)
      .send({ childIds: [child.childId], status: 'ARCHIVED' }).expect(400);
    await request(app.getHttpServer()).post(statusPath).auth(await token(), auth)
      .send({ childIds: [child.childId], status: 'DISABLED' }).expect(200);
    expect(classrooms.setChildrenStatus).toHaveBeenCalledExactlyOnceWith([child.childId], 'DISABLED');
  });

  it('needs RESET_CHILD_LOGIN_CODES to issue a code', async () => {
    actor = { ...teacher, permissions: ['READ_OWN_CLASSROOMS'] };
    await request(app.getHttpServer())
      .post(
        `/api/v1/teacher/classrooms/${randomUUID()}/children/${randomUUID()}/login-code`,
      )
      .auth(await token(), { type: 'bearer' })
      .expect(403);
    expect(classrooms.issueLoginCode).not.toHaveBeenCalled();
  });

  it('needs ASSIGN_ACTIVITIES to assign, READ_OWN_CLASSROOMS to look', async () => {
    const classId = randomUUID();
    const path = `/api/v1/teacher/classrooms/${classId}/assignments`;
    actor = { ...teacher, permissions: ['READ_OWN_CLASSROOMS'] };
    await request(app.getHttpServer())
      .get(path)
      .auth(await token(), { type: 'bearer' })
      .expect(200);
    await request(app.getHttpServer())
      .post(path)
      .auth(await token(), { type: 'bearer' })
      .send({
        title: 'A',
        versionIds: [randomUUID()],
        target: { type: 'CLASS' },
      })
      .expect(403);
    expect(assignments.create).not.toHaveBeenCalled();
    actor = {
      ...teacher,
      permissions: ['READ_OWN_CLASSROOMS', 'ASSIGN_ACTIVITIES'],
    };
    await request(app.getHttpServer())
      .post(path)
      .auth(await token(), { type: 'bearer' })
      .send({ title: 'A', versionIds: [], target: { type: 'CLASS' } })
      .expect(400);
    await request(app.getHttpServer())
      .post(path)
      .auth(await token(), { type: 'bearer' })
      .send({
        title: 'A',
        versionIds: [randomUUID()],
        target: { type: 'CLASS' },
      })
      .expect(201);
  });

  it('serves the child their assignments, and only to a child token', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/gameplay/assignments')
      .auth(await token(), { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/gameplay/assignments')
      .auth(await token('child'), { type: 'bearer' })
      .expect(200);
    expect(assignments.forChild).toHaveBeenCalledWith(
      expect.objectContaining({ childId: child.childId }),
    );
    await request(app.getHttpServer())
      .get(`/api/v1/teacher/classrooms/${randomUUID()}/assignments`)
      .auth(await token('child'), { type: 'bearer' })
      .expect(403);
  });

  it('keeps teacher assessments for teachers, checks the body first, and refuses children', async () => {
    const classId = randomUUID();
    const childId = randomUUID();
    const base = `/api/v1/teacher/classrooms/${classId}/children/${childId}/assessments`;
    actor = teacher;
    await request(app.getHttpServer()).get(base).expect(401);
    await request(app.getHttpServer())
      .post(base)
      .auth(await token(), { type: 'bearer' })
      .send({ criterionCode: '41', periodStart: '2026-11-01', periodEnd: '2026-11-30', content: 'x' })
      .expect(400);
    expect(assessments.create).not.toHaveBeenCalled();
    await request(app.getHttpServer())
      .post(base)
      .auth(await token(), { type: 'bearer' })
      .send({ criterionCode: '43', periodStart: '2026-11-01', periodEnd: '2026-11-30', content: 'Bé đếm đúng.' })
      .expect(201);
    expect(assessments.create).toHaveBeenCalledWith(expect.anything(), classId, childId, expect.objectContaining({ criterionCode: '43' }));
    await request(app.getHttpServer())
      .get(base)
      .auth(await token('child'), { type: 'bearer' })
      .expect(403);
  });
});
