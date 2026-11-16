import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomBytes, randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { configureHttp } from '../src/common/http/configure-http.js';
import { ChildAuthRepository } from '../src/modules/auth/child-auth.repository.js';
import { loginCodeDigest } from '../src/modules/auth/child-login-code.js';
import { stubStorageEnvironment } from './game-asset.fixtures.js';

describe('Child sign-in with a login code (offline; database mocked)', () => {
  let app: INestApplication;
  const secret = randomBytes(48).toString('base64url');
  const codeSecret = randomBytes(32).toString('hex');
  const code = 'K7MQ-2HXA';
  const child = {
    childId: randomUUID(),
    fullName: 'Bé An',
    status: 'ACTIVE' as 'ACTIVE' | 'DISABLED',
  };
  let enrolled = true;
  const tokens = new Map<
    string,
    { verifier: string; sessionId: string; expiresAt: Date }
  >();
  const repository = {
    findByCodeDigest: vi.fn((digest: string) =>
      Promise.resolve(
        digest === loginCodeDigest('K7MQ2HXA', codeSecret)
          ? { ...child }
          : null,
      ),
    ),
    findById: vi.fn((id: string) =>
      Promise.resolve(id === child.childId ? { ...child } : null),
    ),
    hasCurrentClass: vi.fn(() => Promise.resolve(enrolled)),
    createSession: vi.fn(
      (
        _childId: string,
        token: { tokenId: string; verifier: string },
        expiresAt: Date,
      ) => {
        tokens.set(token.tokenId, {
          verifier: token.verifier,
          sessionId: randomUUID(),
          expiresAt,
        });
        return Promise.resolve({});
      },
    ),
    findToken: vi.fn((tokenId: string) => {
      const token = tokens.get(tokenId);
      return Promise.resolve(
        token
          ? {
              ...token,
              session: { childId: child.childId, expiresAt: token.expiresAt },
            }
          : null,
      );
    }),
    rotate: vi.fn(() => Promise.resolve('rotated')),
    revoke: vi.fn(() => Promise.resolve()),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    tokens.clear();
    enrolled = true;
    child.status = 'ACTIVE';
    stubStorageEnvironment();
    vi.stubEnv('JWT_ACCESS_SECRET', secret);
    vi.stubEnv('CHILD_LOGIN_CODE_SECRET', codeSecret);
    vi.stubEnv('AUTH_ALLOWED_ORIGINS', 'http://localhost:3000');
    vi.stubEnv('AUTH_COOKIE_SECURE', 'false');
    vi.stubEnv(
      'DATABASE_URL',
      'postgresql://fixture:fixture@localhost:5433/fixture',
    );
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(ChildAuthRepository)
      .useValue(repository)
      .compile();
    app = module.createNestApplication();
    configureHttp(app);
    await app.init();
  });
  afterEach(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });

  const login = (value: unknown) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/child/login')
      .set('X-CSRF-Protection', '1')
      .set('Origin', 'http://localhost:3000')
      .send({ code: value });

  it('signs a child in with a valid code and a separate refresh cookie', async () => {
    const response = await login(' k7mq 2hxa ').expect(200);
    expect(response.body.data).toMatchObject({
      tokenType: 'Bearer',
      child: { childId: child.childId, fullName: 'Bé An' },
    });
    const cookie = String(response.headers['set-cookie']);
    expect(cookie).toContain('lumikids_child_refresh=');
    expect(cookie).toContain('Path=/api/v1/auth/child');
    expect(cookie).toContain('HttpOnly');
    expect(repository.createSession).toHaveBeenCalledWith(
      child.childId,
      expect.anything(),
      expect.any(Date),
    );

    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/child/me')
      .auth(response.body.data.accessToken as string, { type: 'bearer' })
      .expect(200);
    expect(me.body.data).toMatchObject({ childId: child.childId });
    // The child token is not an adult token.
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .auth(response.body.data.accessToken as string, { type: 'bearer' })
      .expect(403);
  });

  it('gives the same answer for a wrong code, a disabled child and a child without a class', async () => {
    const wrong = await login('AAAA-BBBB').expect(401);
    await login('not a code').expect(401);
    child.status = 'DISABLED';
    const disabled = await login(code).expect(401);
    child.status = 'ACTIVE';
    enrolled = false;
    const unenrolled = await login(code).expect(401);
    expect(disabled.body.message).toBe(wrong.body.message);
    expect(unenrolled.body.message).toBe(wrong.body.message);
    expect(repository.createSession).not.toHaveBeenCalled();
  });

  it('rotates the child refresh cookie and ends it once the child leaves every class', async () => {
    const first = await login(code).expect(200);
    const cookie = String(first.headers['set-cookie']).split(';')[0];
    await request(app.getHttpServer())
      .post('/api/v1/auth/child/refresh-token')
      .set('X-CSRF-Protection', '1')
      .set('Cookie', cookie)
      .expect(200);
    expect(repository.rotate).toHaveBeenCalledTimes(1);
    enrolled = false;
    await request(app.getHttpServer())
      .post('/api/v1/auth/child/refresh-token')
      .set('X-CSRF-Protection', '1')
      .set('Cookie', cookie)
      .expect(401);
    expect(repository.rotate).toHaveBeenCalledTimes(1);
  });

  it('requires the CSRF header and a trusted origin', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/child/login')
      .send({ code })
      .expect(403);
    await login(code).set('Origin', 'https://untrusted.example').expect(403);
  });
});
