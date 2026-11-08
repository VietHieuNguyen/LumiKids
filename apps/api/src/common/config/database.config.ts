import { Inject } from '@nestjs/common';
import { ConfigType, registerAs } from '@nestjs/config';
import { z } from 'zod';

const databaseEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  PORT: z.coerce.number().int().positive().default(3000),
});

export const databaseConfig = registerAs('database', () => {
  const parsed = databaseEnvSchema.parse({
    DATABASE_URL: process.env.DATABASE_URL,
    PORT: process.env.PORT,
  });

  return {
    url: parsed.DATABASE_URL,
    port: parsed.PORT,
  };
});

export type DatabaseConfig = ConfigType<typeof databaseConfig>;

export const InjectDatabaseConfig = () => Inject(databaseConfig.KEY);

