import { registerAs } from '@nestjs/config';
import { hkdfSync } from 'node:crypto';
import { z } from 'zod';

const schema = z.object({ JWT_ACCESS_SECRET: z.string().min(32) });

/** Class invitation codes: only an HMAC is stored, keyed by a secret derived from the JWT secret. */
export default registerAs('family', () => {
  const result = schema.safeParse(process.env);
  if (!result.success)
    throw new Error('Invalid family configuration: JWT_ACCESS_SECRET.');
  return {
    inviteSecret: Buffer.from(
      hkdfSync('sha256', result.data.JWT_ACCESS_SECRET, 'lumikids', 'class-invite', 32),
    ).toString('hex'),
  };
});
