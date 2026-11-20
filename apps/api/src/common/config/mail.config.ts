import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const schema = z.object({
  EMAIL_HOST: z.string().trim().default('smtp.gmail.com'),
  EMAIL_PORT: z.coerce.number().int().min(1).max(65535).default(465),
  EMAIL_USER: z.string().trim().default(''),
  /** A Gmail App Password (16 characters), never the account password. */
  EMAIL_PASSWORD: z.string().default(''),
  EMAIL_FROM: z.string().trim().default(''),
});

/** Outgoing mail (verification codes). Disabled until both EMAIL_USER and EMAIL_PASSWORD are set. */
export default registerAs('mail', () => {
  const result = schema.safeParse(process.env);
  if (!result.success)
    throw new Error('Invalid mail configuration: EMAIL_HOST/EMAIL_PORT.');
  const env = result.data;
  const password = env.EMAIL_PASSWORD.replace(/\s+/g, '');
  return {
    enabled: Boolean(env.EMAIL_USER && password),
    host: env.EMAIL_HOST,
    port: env.EMAIL_PORT,
    // 465 is implicit TLS; 587 upgrades with STARTTLS (required below).
    secure: env.EMAIL_PORT === 465,
    user: env.EMAIL_USER,
    password,
    from: env.EMAIL_FROM || (env.EMAIL_USER ? `LumiKids <${env.EMAIL_USER}>` : ''),
  };
});
