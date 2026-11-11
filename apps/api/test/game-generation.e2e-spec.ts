import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AiClient, AiClientError } from '@lumikids/ai-client';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { UsersService } from '../src/modules/users/users.service.js';
import { GameAssetRepository } from '../src/modules/game-assets/game-asset.repository.js';
import { StorageService } from '../src/common/storage/storage.service.js';
import { configureHttp } from '../src/common/http/configure-http.js';
import {
  adminFixture,
  assetFixture,
  stubStorageEnvironment,
} from './game-asset.fixtures.js';
import type { Principal } from '../src/common/security/principal.js';

describe('Game generation HTTP (offline)', () => {
  let app: INestApplication;
  let actor: Principal;
  let token: string;
  const secret = randomBytes(48).toString('base64url');
  const ai = { generate: vi.fn() };
  const assets = {
    searchForGeneration: vi.fn(),
    findForGeneration: vi.fn(),
    findById: vi.fn(),
  };
  const storage = { getReadUrl: vi.fn() };
  const base = '/api/v1/game-generation/generate';
  beforeEach(async () => {
    vi.resetAllMocks();
    stubStorageEnvironment();
    vi.stubEnv('JWT_ACCESS_SECRET', secret);
    vi.stubEnv('JWT_ISSUER', 'lumikids-api');
    vi.stubEnv('JWT_AUDIENCE', 'lumikids-web');
    vi.stubEnv('AUTH_ALLOWED_ORIGINS', 'http://localhost:3000');
    vi.stubEnv('AUTH_COOKIE_SECURE', 'false');
    vi.stubEnv(
      'DATABASE_URL',
      'postgresql://fixture:fixture@localhost:5433/fixture',
    );
    vi.stubEnv('AI_SERVICE_URL', 'http://ai.example.test');
    vi.stubEnv('AI_SERVICE_TOKEN', secret);
    actor = { ...adminFixture, permissions: ['GENERATE_GAME_CONTENT'] };
    assets.searchForGeneration.mockResolvedValue([assetFixture]);
    assets.findForGeneration.mockResolvedValue([assetFixture]);
    assets.findById.mockResolvedValue(assetFixture);
    storage.getReadUrl.mockResolvedValue({
      url: 'http://media.example.test/signed',
      expiresIn: 900,
      expiresAt: new Date(Date.now() + 900000).toISOString(),
    });
    ai.generate.mockImplementation(async (input) => ({
      requestId: input.requestId,
      model: 'fixture',
      gameContent: {
        schemaVersion: 1,
        gameType: 'COUNTING',
        instruction: 'Đếm bóng',
        items: [{ id: 'b1', assetId: assetFixture.id }],
        choices: [
          { id: 'a', value: 1 },
          { id: 'b', value: 2 },
        ],
        correctChoiceId: 'a',
        completionRule: 'CORRECT_CHOICE',
      },
    }));
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(UsersService)
      .useValue({ requireActivePrincipal: () => Promise.resolve(actor) })
      .overrideProvider(GameAssetRepository)
      .useValue(assets)
      .overrideProvider(StorageService)
      .useValue(storage)
      .overrideProvider(AiClient)
      .useValue(ai)
      .compile();
    app = module.createNestApplication();
    configureHttp(app);
    await app.init();
    token = await app.get(JwtService).signAsync(
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
  });
  afterEach(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });
  const post = () =>
    request(app.getHttpServer()).post(base).auth(token, { type: 'bearer' });
  it('requires authentication', async () => {
    await request(app.getHttpServer())
      .post(base)
      .send({ gameType: 'COUNTING', prompt: 'Bóng' })
      .expect(401);
    expect(ai.generate).not.toHaveBeenCalled();
  });
  it.each(['ROLE_ADMIN', 'ROLE_TEACHER'] as const)(
    'allows %s with GENERATE without READ_GAME_ASSETS',
    async (role) => {
      actor = { ...actor, roles: [role] };
      const result = await post()
        .send({ gameType: 'COUNTING', prompt: 'Đếm bóng đỏ' })
        .expect(200);
      expect(result.body).toMatchObject({
        success: true,
        data: {
          gameType: 'COUNTING',
          generation: { reviewRequired: true, attempts: 1 },
        },
      });
      expect(result.headers['cache-control']).toBe('no-store');
      await request(app.getHttpServer())
        .get('/api/v1/game-assets')
        .auth(token, { type: 'bearer' })
        .expect(403);
    },
  );
  it('rejects guardian and role-only admin without generation permission', async () => {
    actor = {
      ...actor,
      roles: ['ROLE_GUARDIAN'],
      permissions: ['READ_OWN_ACCOUNT'],
    };
    await post().send({ gameType: 'COUNTING', prompt: 'Bóng' }).expect(403);
    actor = { ...actor, roles: ['ROLE_ADMIN'], permissions: [] };
    await post().send({ gameType: 'COUNTING', prompt: 'Bóng' }).expect(403);
    expect(ai.generate).not.toHaveBeenCalled();
  });
  it.each([
    { gameType: 'COUNTING', prompt: ' ' },
    { gameType: 'UNSUPPORTED', prompt: 'Bóng' },
    { gameType: 'COUNTING', prompt: 'x'.repeat(2001) },
    { gameType: 'COUNTING', prompt: 'Bóng', assetIds: [assetFixture.id] },
  ])('rejects invalid body %# before provider call', async (body) => {
    await post().send(body).expect(400);
    expect(ai.generate).not.toHaveBeenCalled();
  });
  it('rejects oversized payload', async () => {
    await post()
      .send({ gameType: 'COUNTING', prompt: 'x'.repeat(110000) })
      .expect(413);
    expect(ai.generate).not.toHaveBeenCalled();
  });
  it('exposes only a static public provider error', async () => {
    ai.generate.mockRejectedValue(
      new AiClientError('AI_PROVIDER_AUTH_ERROR', false),
    );
    const result = await post()
      .send({ gameType: 'COUNTING', prompt: 'Bóng' })
      .expect(503);
    expect(result.body.code).toBe('AI_PROVIDER_AUTH_ERROR');
    expect(JSON.stringify(result.body)).not.toContain(secret);
  });
  it('throttles repeated generation requests', async () => {
    for (let i = 0; i < 4; i++)
      await post().send({ gameType: 'COUNTING', prompt: 'Bóng' }).expect(200);
    await post().send({ gameType: 'COUNTING', prompt: 'Bóng' }).expect(429);
    expect(ai.generate).toHaveBeenCalledTimes(4);
  });
  const read = (id: string, previewToken: string) =>
    request(app.getHttpServer())
      .post(`/api/v1/game-generation/preview-assets/${id}/read-url`)
      .auth(token, { type: 'bearer' })
      .send({ previewToken });
  it('Teacher can resolve only the generated assets, while Library and management remain forbidden', async () => {
    actor = { ...actor, roles: ['ROLE_TEACHER'] };
    const generated = await post()
      .send({ gameType: 'COUNTING', prompt: 'Bóng' })
      .expect(200);
    const proof = generated.body.data.generation.preview.token;
    const response = await read(assetFixture.id, proof).expect(200);
    expect(response.body.data.url).toBe('http://media.example.test/signed');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(storage.getReadUrl).toHaveBeenCalledExactlyOnceWith(
      assetFixture.objectKey,
      assetFixture.mimeType,
    );
    await request(app.getHttpServer())
      .get(`/api/v1/game-assets/${assetFixture.id}/url`)
      .auth(token, { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/game-assets')
      .auth(token, { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/v1/game-assets/${assetFixture.id}`)
      .auth(token, { type: 'bearer' })
      .send({ name: 'blocked' })
      .expect(403);
    await read(randomUUID(), proof).expect(403);
    expect(storage.getReadUrl).toHaveBeenCalledTimes(1);
  });
  it('refuses malformed proofs and other users even with a valid access JWT', async () => {
    const generated = await post()
      .send({ gameType: 'COUNTING', prompt: 'Bóng' })
      .expect(200);
    const proof = generated.body.data.generation.preview.token;
    await read(assetFixture.id, 'invalid').expect(403);
    actor = { ...actor, userId: randomUUID() };
    await read(assetFixture.id, proof).expect(403);
    expect(storage.getReadUrl).not.toHaveBeenCalled();
  });
  it('validates preview body and requires login before resolving storage', async () => {
    const path = `/api/v1/game-generation/preview-assets/${assetFixture.id}/read-url`;
    await request(app.getHttpServer())
      .post(path)
      .send({ previewToken: 'invalid' })
      .expect(401);
    await request(app.getHttpServer())
      .post(path)
      .auth(token, { type: 'bearer' })
      .send({ assetIds: [assetFixture.id] })
      .expect(400);
    expect(storage.getReadUrl).not.toHaveBeenCalled();
  });
  it.each(['missing', 'inactive'])(
    'rechecks %s asset after generation',
    async (state) => {
      const generated = await post()
        .send({ gameType: 'COUNTING', prompt: 'Bóng' })
        .expect(200);
      assets.findById.mockResolvedValue(
        state === 'missing' ? null : { ...assetFixture, status: 'INACTIVE' },
      );
      await read(
        assetFixture.id,
        generated.body.data.generation.preview.token,
      ).expect(state === 'missing' ? 404 : 409);
      expect(storage.getReadUrl).not.toHaveBeenCalled();
    },
  );
});
