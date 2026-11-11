import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const endpoint = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === '/'
    );
  });
const schema = z.object({
  S3_ENDPOINT: endpoint,
  S3_PUBLIC_ENDPOINT: endpoint.optional(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z.enum(['true', 'false']).default('true'),
  S3_READ_URL_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(3600)
    .default(900),
  GAME_ASSET_MAX_SIZE_BYTES: z.coerce
    .number()
    .int()
    .min(1)
    .max(20 * 1024 * 1024)
    .default(5 * 1024 * 1024),
});

export default registerAs('storage', () => {
  const result = schema.safeParse(process.env);
  if (!result.success)
    throw new Error(
      'Invalid S3 configuration. Set application credentials and endpoints using apps/api/.env.example.',
    );
  const env = result.data;
  return {
    endpoint: env.S3_ENDPOINT,
    publicEndpoint: env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT,
    region: env.S3_REGION,
    bucket: env.S3_BUCKET,
    accessKey: env.S3_ACCESS_KEY,
    secretKey: env.S3_SECRET_KEY,
    forcePathStyle: env.S3_FORCE_PATH_STYLE === 'true',
    readUrlTtlSeconds: env.S3_READ_URL_TTL_SECONDS,
    maxSizeBytes: env.GAME_ASSET_MAX_SIZE_BYTES,
  };
});
