import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { randomBytes, randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { configureHttp } from '../src/common/http/configure-http.js';
import { AuthSessionsRepository } from '../src/modules/auth/auth-sessions.repository.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import type {
  AccountStatus,
  PermissionCode,
  RoleCode,
} from '../src/generated/prisma/enums.js';
import { AuthTestStore } from './auth-test-store.js';

describe('Auth HTTP contract (offline)', () => {
  let app: INestApplication;
  let store: AuthTestStore;
  const userId = randomUUID();
  const password = randomBytes(24).toString('base64url');
  const secret = randomBytes(48).toString('base64url');
  let passwordHash: string;
  let status: AccountStatus;
  let roles: RoleCode[];
  let permissions: PermissionCode[];

  beforeAll(async () => {
    passwordHash = await new PasswordService().hash(password);
  });
  beforeEach(async () => {
    vi.stubEnv('S3_ENDPOINT', 'http://storage.example.test:9000');
    vi.stubEnv('S3_PUBLIC_ENDPOINT', 'http://media.example.test:9000');
    vi.stubEnv('S3_REGION', 'us-east-1');
    vi.stubEnv('S3_BUCKET', 'fixture-assets');
    vi.stubEnv('S3_ACCESS_KEY', 'fixture');
    vi.stubEnv('S3_SECRET_KEY', 'fixture');
    vi.stubEnv('JWT_ACCESS_SECRET', secret);
    vi.stubEnv('AUTH_ALLOWED_ORIGINS', 'http://localhost:3000');
    vi.stubEnv('AUTH_COOKIE_SECURE', 'false');
    vi.stubEnv('AUTH_RATE_LIMIT', '3');
    vi.stubEnv('AUTH_RATE_TTL_MS', '60000');
    vi.stubEnv(
      'DATABASE_URL',
      'postgresql://fixture:fixture@localhost:5433/fixture',
    );
    status = 'ACTIVE';
    roles = ['ROLE_TEACHER'];
    permissions = ['READ_OWN_ACCOUNT'];
    store = new AuthTestStore();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        user: {
          findUnique: ({
            where,
          }: {
            where: { email?: string; userId?: string };
          }) =>
            Promise.resolve(
              where.email === 'teacher@example.test' || where.userId === userId
                ? {
                    userId,
                    fullName: 'Fixture',
                    email: 'teacher@example.test',
                    phone: '',
                    address: '',
                    passwordHash,
                    status,
                    roles: roles.map((code) => ({
                      role: {
                        code,
                        permissions: permissions.map((permission) => ({
                          permission: { code: permission },
                        })),
                      },
                    })),
                  }
                : null,
            ),
        },
      })
      .overrideProvider(AuthSessionsRepository)
      .useValue(store)
      .compile();
    app = module.createNestApplication();
    configureHttp(app);
    await app.init();
  });
  afterEach(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });

  const login = (
    body: Record<string, unknown> = { email: 'teacher@example.test', password },
  ) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-CSRF-Protection', '1')
      .send(body);
  const refresh = (cookie: string) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/refresh-token')
      .set('X-CSRF-Protection', '1')
      .set('Cookie', cookie);
  const cookieOf = (response: { headers: Record<string, unknown> }): string => {
    const cookies = response.headers['set-cookie'];
    if (!Array.isArray(cookies) || typeof cookies[0] !== 'string')
      throw new Error('Missing refresh cookie');
    return cookies[0].split(';')[0];
  };
  const dataOf = (response: { body: unknown }): { accessToken: string } => {
    const body = response.body as { data: { accessToken: string } };
    return body.data;
  };

  it('normalizes email, hashes passwords and keeps sensitive fields out of JSON', async () => {
    const response = await login({
      email: ' Teacher@Example.Test ',
      password,
    }).expect(200);
    expect(passwordHash).toMatch(/^\$argon2id\$/);
    expect(passwordHash).not.toBe(password);
    expect(JSON.stringify(response.body)).not.toMatch(
      /passwordHash|refreshExpiresAt|verifier/,
    );
    const cookie = cookieOf(response);
    expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(response.headers['set-cookie'][0]).toContain('SameSite=Lax');
    expect(JSON.stringify([...store.tokens.values()])).not.toContain(
      cookie.split('=')[1],
    );
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .auth(dataOf(response).accessToken, { type: 'bearer' })
      .expect(200);
  });

  it.each([
    { email: 'absent@example.test', password },
    { email: 'teacher@example.test', password: 'wrong' },
  ])(
    'rejects invalid credentials without account enumeration (%#)',
    async (body) => {
      const response = await login(body).expect(401);
      expect(response.body).toEqual({
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Invalid email or password.',
        data: null,
      });
    },
  );
  it('rejects a disabled user', async () => {
    status = 'DISABLED';
    await login().expect(401);
  });
  it.each([
    {},
    { email: 'bad', password: 'x' },
    { email: 'teacher@example.test', password, roles: ['ROLE_ADMIN'] },
  ])('rejects invalid or privilege-escalating input (%#)', async (body) => {
    await login(body).expect(400);
  });
  it('does not expose a registration endpoint', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ roles: ['ROLE_ADMIN'] });
    expect([401, 404]).toContain(response.status);
  });
  it('rejects a missing access token', async () => {
    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
  });
  it('rejects expired, incorrectly signed and incorrectly typed JWTs', async () => {
    const jwt = new JwtService();
    for (const variant of [
      { signingSecret: secret, tokenUse: 'access', expiresIn: -1 },
      {
        signingSecret: randomBytes(48).toString('base64url'),
        tokenUse: 'access',
        expiresIn: 900,
      },
      { signingSecret: secret, tokenUse: 'refresh', expiresIn: 900 },
    ]) {
      const token = await jwt.signAsync(
        { tokenUse: variant.tokenUse },
        {
          secret: variant.signingSecret,
          subject: userId,
          issuer: 'lumikids-api',
          audience: 'lumikids-web',
          expiresIn: variant.expiresIn,
          jwtid: randomUUID(),
        },
      );
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .auth(token, { type: 'bearer' })
        .expect(401);
    }
  });
  it('rejects opaque refresh tokens used as Bearer tokens', async () => {
    const response = await login().expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .auth(cookieOf(response).split('=')[1], { type: 'bearer' })
      .expect(401);
  });
  it('rotates refresh tokens and revokes the whole family on replay', async () => {
    const first = cookieOf(await login().expect(200));
    const second = cookieOf(await refresh(first).expect(200));
    expect(second).not.toBe(first);
    await refresh(first).expect(401);
    await refresh(second).expect(401);
  });
  it('issues at most one successor under concurrent refresh requests', async () => {
    const cookie = cookieOf(await login().expect(200));
    const results = await Promise.all([refresh(cookie), refresh(cookie)]);
    expect(
      results.map((result) => result.status).sort((a, b) => a - b),
    ).toEqual([200, 401]);
    const winner = results.find((result) => result.status === 200);
    if (!winner) throw new Error('Missing successful refresh');
    await refresh(cookieOf(winner)).expect(401);
  });
  it('rejects missing, forged, unknown and expired refresh tokens', async () => {
    await refresh('lumikids_refresh=bad').expect(401);
    await refresh(
      `lumikids_refresh=${randomUUID()}.${randomBytes(32).toString('base64url')}`,
    ).expect(401);
    const cookie = cookieOf(await login().expect(200));
    for (const token of store.tokens.values()) token.expiresAt = new Date(0);
    await refresh(cookie).expect(401);
  });
  it('invalidates refresh on logout while access remains valid until expiry', async () => {
    const response = await login().expect(200);
    const cookie = cookieOf(response);
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('X-CSRF-Protection', '1')
      .set('Cookie', cookie)
      .expect(200);
    await refresh(cookie).expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .auth(dataOf(response).accessToken, { type: 'bearer' })
      .expect(200);
  });
  it('denies another owner even when the caller has the coarse permission', async () => {
    const response = await login().expect(200);
    const token = dataOf(response).accessToken;
    await request(app.getHttpServer())
      .get(`/api/v1/auth/accounts/${userId}`)
      .auth(token, { type: 'bearer' })
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/auth/accounts/${randomUUID()}`)
      .auth(token, { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/auth/accounts/bad-id')
      .auth(token, { type: 'bearer' })
      .expect(400);
  });
  it('requires both a valid role and permission, and observes changes immediately', async () => {
    const token = dataOf(await login().expect(200)).accessToken;
    const probe = () =>
      request(app.getHttpServer())
        .get('/api/v1/auth/authorization-check')
        .auth(token, { type: 'bearer' });
    await probe().expect(403);
    roles = ['ROLE_ADMIN'];
    await probe().expect(403);
    permissions = ['MANAGE_USERS'];
    await probe().expect(200);
    permissions = [];
    await probe().expect(403);
    status = 'DISABLED';
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .auth(token, { type: 'bearer' })
      .expect(401);
  });
  it('rejects unknown roles and permissions without granting access', async () => {
    const token = dataOf(await login().expect(200)).accessToken;
    roles = ['ROLE_ADMIN'];
    permissions = ['UNKNOWN_PERMISSION' as PermissionCode];
    await request(app.getHttpServer())
      .get('/api/v1/auth/authorization-check')
      .auth(token, { type: 'bearer' })
      .expect(403);
    roles = ['ROLE_UNKNOWN' as RoleCode];
    permissions = ['MANAGE_USERS'];
    await request(app.getHttpServer())
      .get('/api/v1/auth/authorization-check')
      .auth(token, { type: 'bearer' })
      .expect(403);
  });
  it('blocks cross-origin and missing CSRF headers', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'teacher@example.test', password })
      .expect(403);
    await login().set('Origin', 'https://untrusted.example').expect(403);
  });
  it('enforces configured login and refresh rate limits with the same error envelope', async () => {
    for (let attempt = 0; attempt < 3; attempt++)
      await login({ email: 'absent@example.test', password }).expect(401);
    const limited = await login().expect(429);
    expect(limited.body).toMatchObject({
      success: false,
      code: 'TOO_MANY_REQUESTS',
      data: null,
    });
    for (let attempt = 0; attempt < 3; attempt++)
      await refresh('lumikids_refresh=bad').expect(401);
    await refresh('lumikids_refresh=bad').expect(429);
  });
  it('sanitizes internal errors', async () => {
    vi.spyOn(store, 'create').mockRejectedValue(
      new Error('SQL and secret details'),
    );
    const response = await login().expect(500);
    expect(response.body).toEqual({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error.',
      data: null,
    });
  });
});
