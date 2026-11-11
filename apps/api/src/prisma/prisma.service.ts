import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import databaseConfig from '../common/config/database.config.js';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(
    @Inject(databaseConfig.KEY) config: ConfigType<typeof databaseConfig>,
  ) {
    super({
      adapter: new PrismaPg({
        connectionString: config.url,
        connectionTimeoutMillis: 5000,
      }),
      errorFormat: 'minimal',
      log: [],
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      // The pg adapter creates its pool lazily; verify a real query at startup.
      await this.checkConnection();
    } catch {
      throw new Error(
        'Cannot connect to PostgreSQL. Check the database and DATABASE_URL.',
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.$disconnect();
    } catch {
      throw new Error('Cannot close the PostgreSQL connection.');
    }
  }

  async checkConnection(): Promise<void> {
    try {
      await this.$queryRaw`SELECT 1`;
    } catch {
      throw new Error(
        'PostgreSQL connection check failed. Check the database and DATABASE_URL.',
      );
    }
  }
}
