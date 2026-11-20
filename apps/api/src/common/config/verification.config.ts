import { registerAs } from '@nestjs/config';
import { hkdfSync } from 'node:crypto';
import { z } from 'zod';

const schema = z.object({
  JWT_ACCESS_SECRET: z.string().min(32),
  NODE_ENV: z.string().default('development'),
});

/** Email verification codes of self-registered guardians (FR-1.6). Only an HMAC of a code is stored. */
export default registerAs('verification', () => {
  const result = schema.safeParse(process.env);
  if (!result.success)
    throw new Error('Invalid verification configuration: JWT_ACCESS_SECRET.');
  const env = result.data;
  return {
    codeSecret: Buffer.from(
      hkdfSync('sha256', env.JWT_ACCESS_SECRET, 'lumikids', 'email-verification', 32),
    ).toString('hex'),
    ttlMinutes: 15,
    maxAttempts: 5,
    resendAfterSeconds: 60,
    /**
     * No mail server is configured yet. Outside production the code is written to the API log so a
     * developer can finish registration; in production it is never logged (a mailer must be added).
     */
    logCodes: env.NODE_ENV !== 'production',
  };
});
