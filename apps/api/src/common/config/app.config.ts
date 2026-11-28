import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const environmentSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  /** `dev` shows the whole system to Admin (home data, no support grant). Local development only. */
  APP_MODE: z.enum(['standard', 'dev']).default('standard'),
  NODE_ENV: z.string().optional(),
  DATABASE_URL: z.string().optional(),
});

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** Dev mode is refused anywhere but a local machine with a local database. */
export function assertDevModeAllowed(environment: z.infer<typeof environmentSchema>): void {
  if (environment.APP_MODE !== 'dev') return;
  if (environment.NODE_ENV === 'production')
    throw new Error('APP_MODE=dev is not allowed when NODE_ENV=production.');
  let host = '';
  try {
    host = new URL(environment.DATABASE_URL ?? '').hostname;
  } catch {
    throw new Error('APP_MODE=dev needs a valid DATABASE_URL on this machine.');
  }
  if (!LOCAL_HOSTS.has(host)) throw new Error('APP_MODE=dev is allowed only with a local database.');
}

export default registerAs('app', () => {
  const environment = environmentSchema.parse(process.env);
  assertDevModeAllowed(environment);
  return { port: environment.PORT, devMode: environment.APP_MODE === 'dev' };
});
