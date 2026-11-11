import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const databaseEnvironmentSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1)
    .refine((value) => {
      try {
        const url = new URL(value);
        return (
          ['postgresql:', 'postgres:'].includes(url.protocol) &&
          url.hostname.length > 0
        );
      } catch {
        return false;
      }
    }),
});

export default registerAs('database', () => {
  const result = databaseEnvironmentSchema.safeParse(process.env);

  if (!result.success) {
    // Do not include the input or a connection string in startup errors.
    throw new Error(
      'DATABASE_URL is required and must be a PostgreSQL connection URL.',
    );
  }

  return { url: result.data.DATABASE_URL };
});
