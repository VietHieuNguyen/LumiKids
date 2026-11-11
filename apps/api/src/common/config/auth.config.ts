import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const schema = z.object({
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().min(1).default('lumikids-api'),
  JWT_AUDIENCE: z.string().min(1).default('lumikids-web'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(900),
  AUTH_REFRESH_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(604800)
    .default(604800),
  AUTH_COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  AUTH_COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  AUTH_ALLOWED_ORIGINS: z.string().min(1),
  AUTH_RATE_TTL_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(3600000)
    .default(60000),
  AUTH_RATE_LIMIT: z.coerce.number().int().min(1).max(1000).default(10),
});

export default registerAs('auth', () => {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    throw new Error(
      'Invalid auth configuration. Set JWT_ACCESS_SECRET (32+ characters) and AUTH_ALLOWED_ORIGINS; check the example file.',
    );
  }
  const env = result.data;
  const origins = env.AUTH_ALLOWED_ORIGINS.split(',').map((value) =>
    value.trim(),
  );
  const secure =
    env.AUTH_COOKIE_SECURE === undefined
      ? process.env.NODE_ENV === 'production'
      : env.AUTH_COOKIE_SECURE === 'true';
  if (
    origins.some((origin) => {
      try {
        const url = new URL(origin);
        return (
          !['http:', 'https:'].includes(url.protocol) || url.origin !== origin
        );
      } catch {
        return true;
      }
    }) ||
    (process.env.NODE_ENV === 'production' &&
      (!secure || origins.some((origin) => !origin.startsWith('https://')))) ||
    (env.AUTH_COOKIE_SAME_SITE === 'none' && !secure)
  ) {
    throw new Error('Invalid auth origins or cookie security configuration.');
  }
  return {
    secret: env.JWT_ACCESS_SECRET,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    accessTtlSeconds: env.JWT_ACCESS_TTL_SECONDS,
    refreshTtlSeconds: env.AUTH_REFRESH_TTL_SECONDS,
    cookieSecure: secure,
    cookieSameSite: env.AUTH_COOKIE_SAME_SITE,
    cookieName: 'lumikids_refresh',
    cookiePath: '/api/v1/auth',
    origins,
    rateTtlMs: env.AUTH_RATE_TTL_MS,
    rateLimit: env.AUTH_RATE_LIMIT,
  };
});
