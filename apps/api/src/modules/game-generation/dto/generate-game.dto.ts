import { BadRequestException, Injectable } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import { generateGameSchema } from '@lumikids/ai-client';
import type { GenerateGameInput } from '@lumikids/ai-client';

@Injectable()
export class GenerateGameValidationPipe implements PipeTransform<
  unknown,
  GenerateGameInput
> {
  transform(value: unknown): GenerateGameInput {
    const parsed = generateGameSchema.safeParse(value);
    if (!parsed.success)
      throw new BadRequestException(
        'GameType không được hỗ trợ hoặc prompt không hợp lệ (1–2000 ký tự). Chỉ chấp nhận gameType và prompt.',
      );
    return parsed.data;
  }
}
