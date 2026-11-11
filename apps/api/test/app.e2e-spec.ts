import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { configureHttp } from '../src/common/http/configure-http.js';
import { randomBytes } from 'node:crypto';
import { stubStorageEnvironment } from './game-asset.fixtures.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(() => {
    stubStorageEnvironment();
    vi.stubEnv('JWT_ACCESS_SECRET', randomBytes(48).toString('base64url'));
    vi.stubEnv('AUTH_ALLOWED_ORIGINS', 'http://localhost:3000');
    vi.stubEnv(
      'DATABASE_URL',
      'postgresql://fixture:fixture@localhost:5433/fixture',
    );
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      // HTTP tests must not open a real database connection.
      .overrideProvider(PrismaService)
      .useValue({ checkConnection: vi.fn().mockResolvedValue(undefined) })
      .compile();

    app = moduleFixture.createNestApplication();
    configureHttp(app);
    await app.init();
  });

  it('/api/v1 (GET)', () => {
    return request(app.getHttpServer()).get('/api/v1').expect(200).expect({
      success: true,
      code: 'OK',
      message: 'Request successful.',
      data: 'Hello World!',
    });
  });

  afterEach(async () => {
    await app?.close();
  });
});
