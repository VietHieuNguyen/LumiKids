import { registerAs } from '@nestjs/config';
import { z } from 'zod';
import { resolve } from 'node:path';

const optional = (schema: z.ZodType<string>) =>
  z.preprocess(
    (value) => (value === '' ? undefined : value),
    schema.optional(),
  );
export default registerAs('ai', () => {
  const parsed = z
    .object({
      AI_SERVICE_URL: optional(
        z.url().refine((value) => {
          const url = new URL(value);
          return (
            ['http:', 'https:'].includes(url.protocol) &&
            !url.username &&
            !url.password &&
            !url.search &&
            !url.hash &&
            url.pathname === '/'
          );
        }),
      ),
      AI_SERVICE_TOKEN: optional(z.string().min(32)),
      AI_SERVICE_TIMEOUT_MS: z.coerce
        .number()
        .int()
        .min(1000)
        .max(65000)
        .default(25000),
    })
    .safeParse(process.env);
  if (!parsed.success)
    throw new Error(
      'Invalid AI gateway configuration. See apps/api/.env.example.',
    );
  return {
    url: parsed.data.AI_SERVICE_URL,
    token: parsed.data.AI_SERVICE_TOKEN,
    timeoutMs: parsed.data.AI_SERVICE_TIMEOUT_MS,
    ...((process.env.NODE_ENV || 'development') === 'development'
      ? {
          diagnosticLogFile: resolve(
            process.cwd(),
            '.logs/game-generation.log',
          ),
        }
      : {}),
  };
});
