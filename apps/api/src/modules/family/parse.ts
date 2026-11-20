import { BadRequestException } from '@nestjs/common';
import type { z } from 'zod';

export function parse<T extends z.ZodType>(schema: T, value: unknown, message: string): z.infer<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new BadRequestException(message);
  return parsed.data;
}
