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
import { AssignmentsRepository } from '../src/modules/learning-content/assignments.repository.js';
import { ClassroomsService } from '../src/modules/classrooms/classrooms.service.js';
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
  const assignmentId = randomUUID();
  const versionId = randomUUID();
  const classId = randomUUID();
  const session = (childId: string) => ({
    sessionId,
    assignmentId,
    versionId,
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
    primaryCriterionCode: vi.fn(() => Promise.resolve('50')),
    finishedPlays: vi.fn(),
    currentClassroom: vi.fn(),
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
      .overrideProvider(ClassroomsService)
      .useValue({ currentClassId: () => Promise.resolve(classId) })
      .overrideProvider(AssignmentsRepository)
      .useValue({
        findRecipientGame: (childId: string, requestedAssignment: string, requestedVersion: string) =>
          Promise.resolve(childId === child.childId && requestedAssignment === assignmentId ? {
            child: { dob: new Date('2021-06-01T00:00:00.000Z') },
            extendedUntil: null,
            assignment: {
              classId,
              source: 'TEACHER',
              status: 'ACTIVE',
              opensAt: new Date('2026-06-01T00:00:00.000Z'),
              dueAt: null,
              items: requestedVersion === versionId ? [{
                version: {
                  versionId,
                  content,
                  difficulty: 'EASY',
                  activity: { ageGroup: { minAge: 5, maxAge: 6 } },
                },
              }] : [],
            },
          } : null),
      })
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
    for (const path of ['/api/v1/auth/me', '/api/v1/auth/profile'])
      await request(app.getHttpServer())
        .get(path)
        .auth(await token(), { type: 'bearer' })
        .expect(403);
  });

  it("shows the child's own corner, with no scores, and only to the child", async () => {
    sessions.finishedPlays.mockResolvedValue([
      {
        versionId: randomUUID(),
        title: 'Đếm quả',
        gameType: 'COUNTING',
        endedAt: new Date(),
      },
    ]);
    sessions.currentClassroom.mockResolvedValue(null);
    const response = await request(app.getHttpServer())
      .get('/api/v1/gameplay/me')
      .auth(await token(), { type: 'bearer' })
      .expect(200);
    expect(response.body.data).toMatchObject({
      fullName: child.fullName,
      classroom: null,
      finishedGames: 1,
    });
    expect(JSON.stringify(response.body.data)).not.toMatch(
      /score|performance/i,
    );
    expect(sessions.finishedPlays).toHaveBeenCalledWith(child.childId, 1000);
    await request(app.getHttpServer())
      .get('/api/v1/gameplay/me')
      .auth(await token('adult'), { type: 'bearer' })
      .expect(403);
  });

  it('lists games for a signed-in child', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/gameplay/games?page=1')
      .auth(await token(), { type: 'bearer' })
      .expect(200);
    expect(response.body).toMatchObject({ success: true, code: 'OK' });
  });

  it('requires an assignment before starting a new play session', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/gameplay/sessions')
      .auth(await token(), { type: 'bearer' })
      .send({ versionId: randomUUID(), startRequestId: randomUUID() })
      .expect(400);
    expect(sessions.start).not.toHaveBeenCalled();
  });

  it('starts a session for the child in the token', async () => {
    sessions.findByStartRequest.mockResolvedValue(null);
    sessions.start.mockImplementation(() =>
      Promise.resolve(session(child.childId)),
    );
    const startRequestId = randomUUID();
    const response = await request(app.getHttpServer())
      .post('/api/v1/gameplay/sessions')
      .auth(await token(), { type: 'bearer' })
      .send({ assignmentId, versionId, startRequestId })
      .expect(201);
    expect(response.body.data).toMatchObject({
      sessionId,
      assignmentId,
      status: 'IN_PROGRESS',
    });
    expect(sessions.start).toHaveBeenCalledWith(
      {
        childId: child.childId,
        assignmentId,
        versionId,
        startRequestId,
        context: 'SCHOOL',
        ageGroup: '5-6',
        difficulty: 'EASY',
        hintLimitPerTask: 1,
      },
    );
  });

  it('refuses another assignment even when the child can play the same game', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/gameplay/sessions')
      .auth(await token(), { type: 'bearer' })
      .send({ assignmentId: randomUUID(), versionId, startRequestId: randomUUID() })
      .expect(404);
    expect(sessions.start).not.toHaveBeenCalled();
  });

  it('records a server-verified event and returns the session state', async () => {
    const response = await request(app.getHttpServer())
      .post(events())
      .auth(await token(), { type: 'bearer' })
      .send({ events: [event('one', 'CORRECT')] })
      .expect(200);
    expect(response.body.data).toMatchObject({ accepted: 1, duplicates: 0 });
    expect(sessions.commitAppend).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedEventCount: 0,
        completion: expect.objectContaining({
          evaluation: expect.objectContaining({
            criterionCode: '50',
            score: 100,
          }),
        }),
      }),
    );
  });
  it('finishes the three comparison/change rounds and evaluates only confirmations for criterion 43', async () => {
    const assetId = randomUUID();
    games.versionContent.mockResolvedValue(
      gameContentSchema.parse({
        schemaVersion: 1,
        gameType: 'QUANTITY_COMPARISON_CHANGE',
        instruction: 'Ba màn',
        items: [{ id: 'object', assetId }],
        basketAssetId: randomUUID(),
        completionRule: 'ALL_QUESTIONS_COMPLETED',
        questions: [
          {
            id: 'compare',
            mode: 'COMPARE',
            assetId,
            initialCount: 3,
            targetCount: 5,
            instruction: 'So sánh',
          },
          {
            id: 'add',
            mode: 'ADD',
            assetId,
            initialCount: 2,
            targetCount: 6,
            instruction: 'Thêm',
          },
          {
            id: 'remove',
            mode: 'REMOVE',
            assetId,
            initialCount: 7,
            targetCount: 0,
            instruction: 'Bớt',
          },
        ],
      }),
    );
    sessions.primaryCriterionCode.mockResolvedValue('43');
    const answer = (index: number) => ({
      schemaVersion: 1,
      eventId: randomUUID(),
      result: 'CORRECT',
      timestamp: new Date().toISOString(),
      attemptIndex: index,
    });
    await request(app.getHttpServer())
      .post(events())
      .auth(await token(), { type: 'bearer' })
      .send({
        events: [
          {
            ...answer(1),
            actionType: 'COMPARE_QUANTITIES',
            sourceId: 'compare',
            targetId: 'LT',
          },
          {
            ...answer(2),
            actionType: 'CONFIRM_QUANTITY_CHANGE',
            sourceId: 'add',
            count: 6,
          },
          {
            ...answer(3),
            actionType: 'CONFIRM_QUANTITY_CHANGE',
            sourceId: 'remove',
            count: 0,
          },
        ],
      })
      .expect(200);
    expect(sessions.commitAppend).toHaveBeenCalledWith(
      expect.objectContaining({
        completion: expect.objectContaining({
          evaluation: expect.objectContaining({
            criterionCode: '43',
            score: 100,
            minimumItemsMet: false,
          }),
        }),
      }),
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
