import { HttpStatus, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaService } from '../prisma/prisma.service';
import { HealthController } from './health.controller';

describe('HealthController (GET /health)', () => {
  let app: INestApplication;
  const prismaServiceMock = {
    checkConnection: jest.fn<Promise<boolean>, []>(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: PrismaService,
          useValue: prismaServiceMock,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('returns HTTP 200 and { status: "ok", database: "up" } when database is alive', async () => {
    prismaServiceMock.checkConnection.mockResolvedValueOnce(true);

    const response = await request(app.getHttpServer()).get('/health');

    expect(response.status).toBe(HttpStatus.OK);
    expect(response.body).toEqual({
      status: 'ok',
      database: 'up',
    });
  });

  it('returns HTTP 503 and { status: "error", database: "down" } when database is unreachable', async () => {
    prismaServiceMock.checkConnection.mockResolvedValueOnce(false);

    const response = await request(app.getHttpServer()).get('/health');

    expect(response.status).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(response.body).toEqual({
      status: 'error',
      database: 'down',
    });
  });
});

