import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { randomBytes, randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { UsersService } from '../src/modules/users/users.service.js';
import { TeacherAccountsService } from '../src/modules/auth/teacher-accounts.service.js';
import { GuardianAccountsService } from '../src/modules/auth/guardian-accounts.service.js';
import { AdminOverviewService } from '../src/modules/admin-overview/admin-overview.service.js';
import { configureHttp } from '../src/common/http/configure-http.js';
import {
  stubStorageEnvironment,
  teacherFixture,
} from './game-asset.fixtures.js';
import type { Principal } from '../src/common/security/principal.js';

describe('Admin HTTP contract (offline; services mocked)', () => {
  let app: INestApplication;
  let actor: Principal;
  const secret = randomBytes(48).toString('base64url');
  const teacher: Principal = {
    ...teacherFixture,
    permissions: ['READ_OWN_ACCOUNT', 'READ_OWN_CLASSROOMS'],
  };
  const admin: Principal = {
    ...teacherFixture,
    userId: randomUUID(),
    roles: ['ROLE_ADMIN'],
    permissions: ['READ_OWN_ACCOUNT', 'MANAGE_CLASSROOMS', 'MANAGE_USERS'],
  };
  const accounts = {
    list: vi.fn(() => Promise.resolve([])),
    create: vi.fn(() =>
      Promise.resolve({ account: {}, temporaryPassword: 'abcd-efgh-jkmn' }),
    ),
    changeOwnPassword: vi.fn(() => Promise.resolve()),
  };
  const overview = { overview: vi.fn(() => Promise.resolve({ totals: {} })) };
  const guardians = {
    list: vi.fn(() => Promise.resolve([])),
    update: vi.fn(() => Promise.resolve({})),
    resetPassword: vi.fn(() =>
      Promise.resolve({ account: {}, temporaryPassword: 'abcd-efgh-jkmn' }),
    ),
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
      .overrideProvider(TeacherAccountsService)
      .useValue(accounts)
      .overrideProvider(AdminOverviewService)
      .useValue(overview)
      .overrideProvider(GuardianAccountsService)
      .useValue(guardians)
      .compile();
    app = module.createNestApplication();
    configureHttp(app);
    await app.init();
  });
  afterEach(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });
  const token = () =>
    app.get(JwtService).signAsync(
      { tokenUse: 'access' },
      {
        secret,
        algorithm: 'HS256',
        subject: actor.userId,
        issuer: 'lumikids-api',
        audience: 'lumikids-web',
        expiresIn: 900,
        jwtid: randomUUID(),
      },
    );

  it('keeps the dashboard and teacher accounts for admins', async () => {
    for (const path of [
      '/api/v1/admin/overview',
      '/api/v1/admin/teacher-accounts',
    ])
      await request(app.getHttpServer())
        .get(path)
        .auth(await token(), { type: 'bearer' })
        .expect(403);
    actor = admin;
    for (const path of [
      '/api/v1/admin/overview',
      '/api/v1/admin/teacher-accounts',
    ])
      await request(app.getHttpServer())
        .get(path)
        .auth(await token(), { type: 'bearer' })
        .expect(200);
  });

  it('keeps guardian accounts for admins: lock/unlock only, password never cached', async () => {
    const guardianId = randomUUID();
    await request(app.getHttpServer())
      .get('/api/v1/admin/guardian-accounts')
      .auth(await token(), { type: 'bearer' })
      .expect(403);
    actor = admin;
    await request(app.getHttpServer())
      .get('/api/v1/admin/guardian-accounts')
      .auth(await token(), { type: 'bearer' })
      .expect(200);
    for (const body of [{ status: 'PENDING_VERIFICATION' }, { status: 'ACTIVE', fullName: 'x' }, {}])
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/guardian-accounts/${guardianId}`)
        .auth(await token(), { type: 'bearer' })
        .send(body)
        .expect(400);
    expect(guardians.update).not.toHaveBeenCalled();
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/guardian-accounts/${guardianId}`)
      .auth(await token(), { type: 'bearer' })
      .send({ status: 'DISABLED' })
      .expect(200);
    expect(guardians.update).toHaveBeenCalledWith(guardianId, { status: 'DISABLED' });
    const reset = await request(app.getHttpServer())
      .post(`/api/v1/admin/guardian-accounts/${guardianId}/password-reset`)
      .auth(await token(), { type: 'bearer' })
      .expect(200);
    expect(reset.headers['cache-control']).toBe('no-store');
  });

  it('validates a new teacher and never caches the temporary password', async () => {
    actor = admin;
    await request(app.getHttpServer())
      .post('/api/v1/admin/teacher-accounts')
      .auth(await token(), { type: 'bearer' })
      .send({ fullName: 'Cô Lan', email: 'not-an-email' })
      .expect(400);
    expect(accounts.create).not.toHaveBeenCalled();
    const response = await request(app.getHttpServer())
      .post('/api/v1/admin/teacher-accounts')
      .auth(await token(), { type: 'bearer' })
      .send({ fullName: 'Cô Lan', email: ' Lan@Example.TEST ' })
      .expect(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(accounts.create).toHaveBeenCalledWith({
      fullName: 'Cô Lan',
      email: 'lan@example.test',
      phone: '',
      specialization: '',
    });
  });

  it('changes the own password behind CSRF and clears the refresh cookie', async () => {
    const bearer = await token();
    const send = () =>
      request(app.getHttpServer())
        .post('/api/v1/auth/password')
        .auth(bearer, { type: 'bearer' })
        .send({
          currentPassword: 'old-password',
          newPassword: 'a-new-password',
        });
    await send().expect(403);
    const response = await send()
      .set('X-CSRF-Protection', '1')
      .set('Origin', 'http://localhost:3000')
      .expect(200);
    expect(String(response.headers['set-cookie'])).toMatch(
      /Expires=Thu, 01 Jan 1970/,
    );
    expect(accounts.changeOwnPassword).toHaveBeenCalledWith(actor, {
      currentPassword: 'old-password',
      newPassword: 'a-new-password',
    });
  });
});
