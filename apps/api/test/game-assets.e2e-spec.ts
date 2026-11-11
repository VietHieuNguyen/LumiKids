import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ServiceUnavailableException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
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
  pngFixture,
  stubStorageEnvironment,
  teacherFixture,
} from './game-asset.fixtures.js';
import type { Principal } from '../src/common/security/principal.js';

describe('GameAsset HTTP contract (offline; storage and database mocked)', () => {
  let app: INestApplication;
  let token: string;
  let actor: Principal;
  const secret = randomBytes(48).toString('base64url');
  const repository = {
    create: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    list: vi.fn(),
  };
  const storage = {
    uploadObject: vi.fn(),
    deleteObject: vi.fn(),
    getReadUrl: vi.fn(),
  };
  const base = '/api/v1/game-assets';

  beforeEach(async () => {
    vi.resetAllMocks();
    stubStorageEnvironment();
    vi.stubEnv('GAME_ASSET_MAX_SIZE_BYTES', '1024');
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
    actor = adminFixture;
    repository.create.mockResolvedValue(assetFixture);
    repository.findById.mockResolvedValue(assetFixture);
    repository.update.mockResolvedValue(assetFixture);
    repository.list.mockResolvedValue({
      items: [assetFixture],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });
    storage.uploadObject.mockResolvedValue(undefined);
    storage.deleteObject.mockResolvedValue(undefined);
    storage.getReadUrl.mockResolvedValue({
      url: 'http://media.example.test/signed',
      expiresIn: 900,
    });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(UsersService)
      .useValue({ requireActivePrincipal: () => Promise.resolve(actor) })
      .overrideProvider(GameAssetRepository)
      .useValue(repository)
      .overrideProvider(StorageService)
      .useValue(storage)
      .compile();
    app = module.createNestApplication();
    configureHttp(app);
    await app.init();
    token = await app.get(JwtService).signAsync(
      { tokenUse: 'access' },
      {
        secret,
        algorithm: 'HS256',
        subject: adminFixture.userId,
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

  const upload = () =>
    request(app.getHttpServer())
      .post(base)
      .auth(token, { type: 'bearer' })
      .field('name', 'Red ball')
      .field('objectType', 'BALL')
      .field('tags', '["red","ball"]')
      .field('attributes', '{"color":"RED"}');

  it('accepts a complete multipart request and returns the standard envelope', async () => {
    const response = await upload()
      .attach('file', pngFixture, 'ball.png')
      .expect(201);
    expect(response.body).toMatchObject({
      success: true,
      data: { id: assetFixture.id, objectType: 'BALL' },
    });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: ['red', 'ball'],
        attributes: { color: 'RED' },
        mimeType: 'image/png',
      }),
    );
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it('rejects unauthenticated requests', async () => {
    await request(app.getHttpServer()).get(base).expect(401);
  });
  it('permits a reader but denies upload/metadata/status management before side effects', async () => {
    actor = teacherFixture;
    await request(app.getHttpServer())
      .get(base)
      .auth(token, { type: 'bearer' })
      .expect(200);
    await upload().attach('file', pngFixture, 'ball.png').expect(403);
    await request(app.getHttpServer())
      .patch(`${base}/${assetFixture.id}`)
      .auth(token, { type: 'bearer' })
      .send({ name: 'New name' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`${base}/${assetFixture.id}/status`)
      .auth(token, { type: 'bearer' })
      .send({ status: 'INACTIVE' })
      .expect(403);
    expect(storage.uploadObject).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
  });
  it('does not grant permission based only on ROLE_ADMIN', async () => {
    actor = { ...adminFixture, permissions: [] };
    await request(app.getHttpServer())
      .get(base)
      .auth(token, { type: 'bearer' })
      .expect(403);
  });
  it('requires an actual image file', async () => {
    await upload().expect(400);
    await upload()
      .attach('file', Buffer.from('not an image'), {
        filename: 'fake.png',
        contentType: 'image/png',
      })
      .expect(400);
  });
  it('enforces multipart size at the interceptor boundary', async () => {
    const response = await upload()
      .attach('file', Buffer.alloc(1025), 'large.png')
      .expect(413);
    expect(response.body.code).toBe('PAYLOAD_TOO_LARGE');
    expect(storage.uploadObject).not.toHaveBeenCalled();
  });
  it('rejects extra files and unexpected form fields', async () => {
    await upload()
      .attach('file', pngFixture, 'one.png')
      .attach('file', pngFixture, 'two.png')
      .expect(400);
    await upload()
      .field('objectKey', 'overwrite.png')
      .attach('file', pngFixture, 'one.png')
      .expect(400);
    expect(storage.uploadObject).not.toHaveBeenCalled();
  });
  it('rejects malformed JSON and immutable metadata', async () => {
    await request(app.getHttpServer())
      .post(base)
      .auth(token, { type: 'bearer' })
      .field('name', 'Ball')
      .field('objectType', 'BALL')
      .field('tags', 'not-json')
      .attach('file', pngFixture, 'ball.png')
      .expect(400);
    await request(app.getHttpServer())
      .patch(`${base}/${assetFixture.id}`)
      .auth(token, { type: 'bearer' })
      .send({ objectKey: 'replacement.png' })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`${base}/${assetFixture.id}`)
      .auth(token, { type: 'bearer' })
      .send({})
      .expect(400);
  });
  it('allows PATCH with validated metadata and supports CORS preflight', async () => {
    await request(app.getHttpServer())
      .patch(`${base}/${assetFixture.id}`)
      .auth(token, { type: 'bearer' })
      .send({ name: 'Blue ball' })
      .expect(200);
    expect(repository.update).toHaveBeenCalledWith(assetFixture.id, {
      name: 'Blue ball',
    });
    const response = await request(app.getHttpServer())
      .options(`${base}/${assetFixture.id}`)
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'PATCH')
      .expect(204);
    expect(response.headers['access-control-allow-methods']).toContain('PATCH');
  });
  it('changes status without deleting the file', async () => {
    await request(app.getHttpServer())
      .patch(`${base}/${assetFixture.id}/status`)
      .auth(token, { type: 'bearer' })
      .send({ status: 'INACTIVE' })
      .expect(200);
    expect(repository.update).toHaveBeenCalledWith(assetFixture.id, {
      status: 'INACTIVE',
    });
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });
  it('validates pagination and filters before querying the repository', async () => {
    await request(app.getHttpServer())
      .get(base)
      .auth(token, { type: 'bearer' })
      .query({
        page: 2,
        pageSize: 10,
        objectType: 'ANIMAL',
        tags: '["water"]',
        attributes: '{"habitat":"WATER"}',
      })
      .expect(200);
    expect(repository.list).toHaveBeenCalledWith({
      page: 2,
      pageSize: 10,
      objectType: 'ANIMAL',
      tags: ['water'],
      attributes: { habitat: 'WATER' },
      status: 'ACTIVE',
    });
    await request(app.getHttpServer())
      .get(base)
      .auth(token, { type: 'bearer' })
      .query({ pageSize: 1000 })
      .expect(400);
  });
  it('rejects invalid UUID and returns missing asset as 404', async () => {
    await request(app.getHttpServer())
      .get(`${base}/invalid`)
      .auth(token, { type: 'bearer' })
      .expect(400);
    repository.findById.mockResolvedValue(null);
    await request(app.getHttpServer())
      .get(`${base}/${assetFixture.id}`)
      .auth(token, { type: 'bearer' })
      .expect(404);
  });
  it('returns signed URL for reader, blocks inactive reads, allows admin inspection', async () => {
    actor = teacherFixture;
    const response = await request(app.getHttpServer())
      .get(`${base}/${assetFixture.id}/url`)
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(response.body.data.expiresIn).toBe(900);
    repository.findById.mockResolvedValue({
      ...assetFixture,
      status: 'INACTIVE',
    });
    await request(app.getHttpServer())
      .get(`${base}/${assetFixture.id}/url`)
      .auth(token, { type: 'bearer' })
      .expect(409);
    actor = adminFixture;
    await request(app.getHttpServer())
      .get(`${base}/${assetFixture.id}/url`)
      .auth(token, { type: 'bearer' })
      .expect(200);
  });
  it('sanitizes storage and database failures, cleans up after DB failure', async () => {
    storage.uploadObject.mockRejectedValueOnce(
      new ServiceUnavailableException('storage fixture-secret'),
    );
    const storageFailure = await upload()
      .attach('file', pngFixture, 'ball.png')
      .expect(503);
    expect(JSON.stringify(storageFailure.body)).not.toContain('fixture-secret');
    repository.create.mockRejectedValueOnce(
      new Error('database fixture-secret'),
    );
    const dbFailure = await upload()
      .attach('file', pngFixture, 'ball.png')
      .expect(503);
    expect(dbFailure.body.code).toBe('SERVICE_UNAVAILABLE');
    expect(JSON.stringify(dbFailure.body)).not.toContain('fixture-secret');
    expect(storage.deleteObject).toHaveBeenCalledOnce();
  });
});
