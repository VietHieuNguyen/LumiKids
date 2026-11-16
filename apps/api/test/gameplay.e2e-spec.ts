import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { gameContentSchema } from '@lumikids/shared';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { UsersService } from '../src/modules/users/users.service.js';
import { PlayableGameService } from '../src/modules/learning-content/playable-game.service.js';
import { PlaySessionRepository } from '../src/modules/gameplay/application/play-session.repository.js';
import { ChildAuthService } from '../src/modules/auth/child-auth.service.js';
import { configureHttp } from '../src/common/http/configure-http.js';
import {
  stubStorageEnvironment,
  teacherFixture,
} from './game-asset.fixtures.js';
import type {
  ChildPrincipal,
  Principal,
} from '../src/common/security/principal.js';

describe('Gameplay HTTP contract (offline; database mocked)', () => {
  let app: INestApplication;
  const secret = randomBytes(48).toString('base64url');
  const child: ChildPrincipal = {
    childId: randomUUID(),
    fullName: 'Trẻ test',
    permissions: [
      'PLAY_GAMES',
      'SUBMIT_OWN_INTERACTIONS',
      'READ_OWN_PLAY_SESSIONS',
    ],
  };
  const adult: Principal = teacherFixture;
  const content = gameContentSchema.parse({
    schemaVersion: 1,
    gameType: 'COUNTING',
    instruction: 'Đếm hình',
    items: [{ id: 'a', assetId: randomUUID() }],
    choices: [
      { id: 'one', value: 1 },
      { id: 'two', value: 2 },
    ],
    correctChoiceId: 'one',
    completionRule: 'CORRECT_CHOICE',
  });
  const sessionId = randomUUID();
  const session = (childId: string) => ({
    sessionId,
    versionId: randomUUID(),
    childId,
    status: 'IN_PROGRESS' as const,
    eventCount: 0,
    startedAt: new Date(),
    endedAt: null,
  });
  const sessions = {
    findById: vi.fn(),
    findByStartRequest: vi.fn(),
    start: vi.fn(),
    listInteractions: vi.fn(),
    findForeignEventIds: vi.fn(),
    commitAppend: vi.fn(),
    abandon: vi.fn(),
  };
  const games = {
    list: vi.fn(),
    detail: vi.fn(),
    readUrl: vi.fn(),
    versionContent: vi.fn(),
  };
  const event = (sourceId: string, result: 'CORRECT' | 'INCORRECT') => ({
    schemaVersion: 1,
    eventId: randomUUID(),
    actionType: 'SELECT_CHOICE',
    sourceId,
    result,
    timestamp: new Date().toISOString(),
    attemptIndex: 1,
  });

  beforeEach(async () => {
    vi.resetAllMocks();
    stubStorageEnvironment();
    vi.stubEnv('JWT_ACCESS_SECRET', secret);
    vi.stubEnv('JWT_ISSUER', 'lumikids-api');
    vi.stubEnv('JWT_AUDIENCE', 'lumikids-web');
    vi.stubEnv('JWT_ACCESS_TTL_SECONDS', '900');
    vi.stubEnv('AUTH_ALLOWED_ORIGINS', 'http://localhost:3000');
    vi.stubEnv('AUTH_COOKIE_SECURE', 'false');
    vi.stubEnv(
      'DATABASE_URL',
      'postgresql://fixture:fixture@localhost:5433/fixture',
    );
    sessions.findById.mockImplementation(() =>
      Promise.resolve(session(child.childId)),
    );
    sessions.listInteractions.mockResolvedValue([]);
    sessions.findForeignEventIds.mockResolvedValue([]);
    sessions.commitAppend.mockResolvedValue(true);
    games.versionContent.mockResolvedValue(content);
    games.list.mockResolvedValue({
      items: [],
      pagination: { page: 1, pageSize: 12, total: 0, totalPages: 0 },
    });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(UsersService)
      .useValue({ requireActivePrincipal: () => Promise.resolve(adult) })
      .overrideProvider(ChildAuthService)
      .useValue({ requireActiveChild: () => Promise.resolve(child) })
      .overrideProvider(PlaySessionRepository)
      .useValue(sessions)
      .overrideProvider(PlayableGameService)
      .useValue(games)
      .compile();
    app = module.createNestApplication();
    configureHttp(app);
    await app.init();
  });
  afterEach(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });
  // A child token by default; an adult (teacher) token on request.
  const token = (kind: 'child' | 'adult' = 'child') =>
    app.get(JwtService).signAsync(
      { tokenUse: kind === 'child' ? 'child_access' : 'access' },
      {
        secret,
        algorithm: 'HS256',
        subject: kind === 'child' ? child.childId : adult.userId,
        issuer: 'lumikids-api',
        audience: 'lumikids-web',
        expiresIn: 900,
        jwtid: randomUUID(),
      },
    );
  const events = () => `/api/v1/gameplay/sessions/${sessionId}/events`;

  it('keeps the learner API closed to adult accounts', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/gameplay/games')
      .auth(await token('adult'), { type: 'bearer' })
      .expect(403);
  });

  it('refuses a child token on adult routes', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .auth(await token(), { type: 'bearer' })
      .expect(403);
  });

  it('lists games for a signed-in child', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/gameplay/games?page=1')
      .auth(await token(), { type: 'bearer' })
      .expect(200);
    expect(response.body).toMatchObject({ success: true, code: 'OK' });
  });

  it('starts a session for the child in the token', async () => {
    games.detail.mockResolvedValue({ content });
    sessions.findByStartRequest.mockResolvedValue(null);
    sessions.start.mockImplementation(() =>
      Promise.resolve(session(child.childId)),
    );
    const startRequestId = randomUUID();
    const response = await request(app.getHttpServer())
      .post('/api/v1/gameplay/sessions')
      .auth(await token(), { type: 'bearer' })
      .send({ versionId: randomUUID(), startRequestId })
      .expect(201);
    expect(response.body.data).toMatchObject({
      sessionId,
      status: 'IN_PROGRESS',
    });
    expect(sessions.start).toHaveBeenCalledWith(
      expect.objectContaining({ childId: child.childId, startRequestId }),
    );
  });

  it('records a server-verified event and returns the session state', async () => {
    const response = await request(app.getHttpServer())
      .post(events())
      .auth(await token(), { type: 'bearer' })
      .send({ events: [event('one', 'CORRECT')] })
      .expect(200);
    expect(response.body.data).toMatchObject({ accepted: 1, duplicates: 0 });
    expect(sessions.commitAppend).toHaveBeenCalledWith(
      expect.objectContaining({ completed: true, expectedEventCount: 0 }),
    );
  });

  it('rejects a client result that disagrees with the answer key', async () => {
    const response = await request(app.getHttpServer())
      .post(events())
      .auth(await token(), { type: 'bearer' })
      .send({ events: [event('two', 'CORRECT')] })
      .expect(422);
    expect(response.body.code).toBe('INTERACTION_RESULT_MISMATCH');
    expect(sessions.commitAppend).not.toHaveBeenCalled();
  });

  it('hides sessions owned by another child and validates the batch shape', async () => {
    sessions.findById.mockResolvedValue(session(randomUUID()));
    await request(app.getHttpServer())
      .post(events())
      .auth(await token(), { type: 'bearer' })
      .send({ events: [event('one', 'CORRECT')] })
      .expect(404);
    await request(app.getHttpServer())
      .post(events())
      .auth(await token(), { type: 'bearer' })
      .send({ events: [] })
      .expect(400);
  });
});
