import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { GenerateGameInput } from '@lumikids/ai-client';
import type { Principal } from '../../common/security/principal.js';
import {
  CurrentUser,
  Permissions,
} from '../auth/decorators/auth.decorators.js';
import { GenerateGameValidationPipe } from './dto/generate-game.dto.js';
import { GameGenerationService } from './game-generation.service.js';
import { GamePreviewAccessService } from './game-preview-access.service.js';
import { z } from 'zod';

const previewRequestSchema = z.strictObject({
  previewToken: z.string().min(1).max(16384),
});

@Controller('game-generation')
export class GameGenerationController {
  constructor(
    private readonly generation: GameGenerationService,
    private readonly preview: GamePreviewAccessService,
  ) {}
  @Post('generate')
  @HttpCode(200)
  @Permissions('GENERATE_GAME_CONTENT')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 4, ttl: 60000 } })
  async generate(
    @CurrentUser() user: Principal,
    @Body(GenerateGameValidationPipe) input: GenerateGameInput,
  ) {
    const result = await this.generation.generate(user, input);
    return {
      ...result,
      generation: {
        ...result.generation,
        preview: await this.preview.issue(user, result.gameContent),
      },
    };
  }

  @Post('preview-assets/:id/read-url')
  @HttpCode(200)
  @Permissions('GENERATE_GAME_CONTENT')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 180, ttl: 60000 } })
  readPreviewAsset(
    @CurrentUser() user: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const parsed = previewRequestSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException('Invalid preview access request.');
    return this.preview.readUrl(user, id, parsed.data.previewToken);
  }
}
