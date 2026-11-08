import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import {
  DatabaseConfig,
  InjectDatabaseConfig,
} from '../config/database.config';

@Injectable()
export class PrismaService implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor(
    @InjectDatabaseConfig()
    private readonly dbConfig: DatabaseConfig,
  ) {
    this.pool = new Pool({
      connectionString: this.dbConfig.url,
      connectionTimeoutMillis: 2000,
      query_timeout: 2000,
    });

    this.pool.on('error', () => {
      // Prevent unhandled error event on idle client when PostgreSQL container stops
    });
  }

  async checkConnection(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
