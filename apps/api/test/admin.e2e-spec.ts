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
import { AccountProfileService } from '../src/modules/auth/account-profile.service.js';
import { AdminOverviewService } from '../src/modules/admin-overview/admin-overview.service.js';
import { SiteSettingsService } from '../src/modules/site-settings/site-settings.service.js';
import { ClassroomsService } from '../src/modules/classrooms/classrooms.service.js';
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
  const profiles = {
    get: vi.fn(() => Promise.resolve({})),
    update: vi.fn(() => Promise.resolve({})),
  };
  const site = {
    get: vi.fn(() => Promise.resolve({ siteName: 'LumiKids' })),
    update: vi.fn(() => Promise.resolve({})),
    replaceLogo: vi.fn(() => Promise.resolve({})),
    removeLogo: vi.fn(() => Promise.resolve({})),
    logo: vi.fn(() =>
      Promise.resolve({ body: Buffer.from('png'), mimeType: 'image/png' }),
    ),
  };
  const catalogue = {
    ageGroupUsage: vi.fn(() => Promise.resolve([])),
    renameAgeGroup: vi.fn(() => Promise.resolve({})),
    reorderAgeGroups: vi.fn(() => Promise.resolve([])),
    schoolYearUsage: vi.fn(() => Promise.resolve([])),
  };
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
      .overrideProvider(AccountProfileService)
      .useValue(profiles)
      .overrideProvider(SiteSettingsService)
      .useValue(site)
      .overrideProvider(ClassroomsService)
      .useValue(catalogue)
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
    for (const body of [
      { status: 'PENDING_VERIFICATION' },
      { status: 'ACTIVE', fullName: 'x' },
      {},
    ])
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
    expect(guardians.update).toHaveBeenCalledWith(guardianId, {
      status: 'DISABLED',
    });
    const reset = await request(app.getHttpServer())
      .post(`/api/v1/admin/guardian-accounts/${guardianId}/password-reset`)
      .auth(await token(), { type: 'bearer' })
      .expect(200);
    expect(reset.headers['cache-control']).toBe('no-store');
  });

  it('shows the branding to everyone and lets only admins change it', async () => {
    await request(app.getHttpServer()).get('/api/v1/site-settings').expect(200);
    const logo = await request(app.getHttpServer())
      .get('/api/v1/site-settings/logo?v=abc')
      .expect(200);
    expect(logo.headers['content-type']).toMatch(/^image\/png/);
    expect(logo.headers['x-content-type-options']).toBe('nosniff');
    expect(logo.headers['cache-control']).toBe('public, max-age=86400');
    await request(app.getHttpServer())
      .patch('/api/v1/admin/site-settings')
      .auth(await token(), { type: 'bearer' })
      .send({ siteName: 'Hoa Sen' })
      .expect(403);
    actor = admin;
    for (const body of [
      {},
      { siteName: '' },
      { landingScene: 'MOON' },
      { logoObjectKey: 'x' },
    ])
      await request(app.getHttpServer())
        .patch('/api/v1/admin/site-settings')
        .auth(await token(), { type: 'bearer' })
        .send(body)
        .expect(400);
    expect(site.update).not.toHaveBeenCalled();
    await request(app.getHttpServer())
      .patch('/api/v1/admin/site-settings')
      .auth(await token(), { type: 'bearer' })
      .send({ siteName: ' Hoa Sen ', tagline: '' })
      .expect(200);
    expect(site.update).toHaveBeenCalledWith({
      siteName: 'Hoa Sen',
      tagline: null,
    });
  });

  it('lets admins rename and reorder age groups but never change their ages', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/age-groups')
      .auth(await token(), { type: 'bearer' })
      .expect(403);
    actor = admin;
    for (const body of [
      { minAge: 2 },
      { name: 'Mầm', maxAge: 4 },
      { name: '  ' },
    ])
      await request(app.getHttpServer())
        .patch('/api/v1/admin/age-groups/AG_3_4')
        .auth(await token(), { type: 'bearer' })
        .send(body)
        .expect(400);
    expect(catalogue.renameAgeGroup).not.toHaveBeenCalled();
    await request(app.getHttpServer())
      .patch('/api/v1/admin/age-groups/AG_3_4')
      .auth(await token(), { type: 'bearer' })
      .send({ name: ' Mầm ' })
      .expect(200);
    expect(catalogue.renameAgeGroup).toHaveBeenCalledWith('AG_3_4', {
      name: 'Mầm',
    });
    await request(app.getHttpServer())
      .put('/api/v1/admin/age-groups/order')
      .auth(await token(), { type: 'bearer' })
      .send({ ageGroupIds: ['A', 'A'] })
      .expect(400);
    await request(app.getHttpServer())
      .put('/api/v1/admin/age-groups/order')
      .auth(await token(), { type: 'bearer' })
      .send({ ageGroupIds: ['B', 'A'] })
      .expect(200);
    expect(catalogue.reorderAgeGroups).toHaveBeenCalledWith({
      ageGroupIds: ['B', 'A'],
    });
  });

  it('lets any adult edit their own name and phone, never email or roles', async () => {
    for (const body of [
      { email: 'x@example.test' },
      { roles: ['ROLE_ADMIN'] },
      { fullName: '   ' },
      {},
    ])
      await request(app.getHttpServer())
        .patch('/api/v1/auth/profile')
        .auth(await token(), { type: 'bearer' })
        .send(body)
        .expect(400);
    expect(profiles.update).not.toHaveBeenCalled();
    await request(app.getHttpServer())
      .patch('/api/v1/auth/profile')
      .auth(await token(), { type: 'bearer' })
      .send({ fullName: ' Cô Lan ', phone: '0900' })
      .expect(200);
    expect(profiles.update).toHaveBeenCalledWith(
      expect.objectContaining({ userId: actor.userId }),
      { fullName: 'Cô Lan', phone: '0900' },
    );
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
