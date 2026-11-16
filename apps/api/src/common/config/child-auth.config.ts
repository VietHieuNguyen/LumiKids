import { registerAs } from '@nestjs/config';
import { hkdfSync } from 'node:crypto';
import { z } from 'zod';

const schema = z.object({
  JWT_ACCESS_SECRET: z.string().min(32),
  CHILD_LOGIN_CODE_SECRET: z.string().min(32).optional(),
  // Classroom devices are shared: a child session lasts a school day by default, not a week.
  CHILD_REFRESH_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(604800)
    .default(43200),
});

export default registerAs('childAuth', () => {
  const result = schema.safeParse(process.env);
  if (!result.success)
    throw new Error(
      'Invalid child auth configuration. CHILD_LOGIN_CODE_SECRET (optional) needs 32+ characters; check the example file.',
    );
  const env = result.data;
  // Without a dedicated secret, derive one from the JWT secret (rotating that secret then invalidates all codes).
  const codeSecret =
    env.CHILD_LOGIN_CODE_SECRET ??
    Buffer.from(
      hkdfSync(
        'sha256',
        env.JWT_ACCESS_SECRET,
        'lumikids',
        'child-login-code',
        32,
      ),
    ).toString('hex');
  return {
    codeSecret,
    refreshTtlSeconds: env.CHILD_REFRESH_TTL_SECONDS,
    cookieName: 'lumikids_child_refresh',
    cookiePath: '/api/v1/auth/child',
  };
});
