import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  playableGameQuerySchema,
  startPlaySessionSchema,
  submitInteractionsSchema,
} from '@lumikids/shared';
import {
  CurrentUser,
  Permissions,
} from '../../auth/decorators/auth.decorators.js';
import type { Principal } from '../../../common/security/principal.js';
import { GameplayService } from '../application/gameplay.service.js';

@Controller('gameplay')
export class GameplayController {
  constructor(private readonly gameplay: GameplayService) {}

  @Get('games')
  @Permissions('PLAY_GAMES')
  list(@CurrentUser() user: Principal, @Query() value: unknown) {
    const parsed = playableGameQuerySchema.safeParse(value);
    if (!parsed.success)
      throw new BadRequestException('Bộ lọc trò chơi không hợp lệ.');
    return this.gameplay.listGames(user, parsed.data);
  }

  @Get('games/:versionId')
  @Permissions('PLAY_GAMES')
  detail(
    @CurrentUser() user: Principal,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ) {
    return this.gameplay.gameDetail(user, versionId);
  }

  @Get('games/:versionId/assets/:assetId/read-url')
  @Permissions('PLAY_GAMES')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 180, ttl: 60000 } })
  readUrl(
    @CurrentUser() user: Principal,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Param('assetId', ParseUUIDPipe) assetId: string,
  ) {
    return this.gameplay.assetReadUrl(user, versionId, assetId);
  }

  @Post('sessions')
  @Permissions('PLAY_GAMES')
  start(@CurrentUser() user: Principal, @Body() value: unknown) {
    const parsed = startPlaySessionSchema.safeParse(value);
    if (!parsed.success)
      throw new BadRequestException('Yêu cầu bắt đầu lượt chơi không hợp lệ.');
    return this.gameplay.start(user, parsed.data);
  }

  @Get('sessions/:sessionId')
  @Permissions('READ_OWN_PLAY_SESSIONS')
  get(
    @CurrentUser() user: Principal,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return this.gameplay.get(user, sessionId);
  }

  @Post('sessions/:sessionId/events')
  @HttpCode(200)
  @Permissions('SUBMIT_OWN_INTERACTIONS')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 240, ttl: 60000 } })
  submit(
    @CurrentUser() user: Principal,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() value: unknown,
  ) {
    const parsed = submitInteractionsSchema.safeParse(value);
    if (!parsed.success)
      throw new BadRequestException('Dữ liệu thao tác không hợp lệ.');
    return this.gameplay.submit(user, sessionId, parsed.data.events);
  }

  @Post('sessions/:sessionId/abandon')
  @HttpCode(200)
  @Permissions('SUBMIT_OWN_INTERACTIONS')
  abandon(
    @CurrentUser() user: Principal,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return this.gameplay.abandon(user, sessionId);
  }
}
