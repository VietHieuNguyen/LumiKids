import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const environmentSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
});

export default registerAs('app', () => {
  const environment = environmentSchema.parse(process.env);

  return { port: environment.PORT };
});
