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
  ChildRoute,
  CurrentChild,
  Permissions,
} from '../../auth/decorators/auth.decorators.js';
import type { ChildPrincipal } from '../../../common/security/principal.js';
import { GameplayService } from '../application/gameplay.service.js';

/** Child-only: requires a child access token (sign-in with a login code). */
@Controller('gameplay')
@ChildRoute()
export class GameplayController {
  constructor(private readonly gameplay: GameplayService) {}

  @Get('me')
  @Permissions('READ_OWN_PLAY_SESSIONS')
  corner(@CurrentChild() child: ChildPrincipal) {
    return this.gameplay.corner(child);
  }

  @Get('assignments')
  @Permissions('PLAY_GAMES')
  assignments(@CurrentChild() child: ChildPrincipal) {
    return this.gameplay.listAssignments(child);
  }

  /** After the deadline the child asks the teacher to play again; idempotent while pending. */
  @Post('assignments/:assignmentId/replay-requests')
  @Permissions('PLAY_GAMES')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  requestReplay(
    @CurrentChild() child: ChildPrincipal,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
  ) {
    return this.gameplay.requestReplay(child, assignmentId);
  }

  @Get('games')
  @Permissions('PLAY_GAMES')
  list(@CurrentChild() child: ChildPrincipal, @Query() value: unknown) {
    const parsed = playableGameQuerySchema.safeParse(value);
    if (!parsed.success)
      throw new BadRequestException('Bộ lọc trò chơi không hợp lệ.');
    return this.gameplay.listGames(child, parsed.data);
  }

  @Get('games/:versionId')
  @Permissions('PLAY_GAMES')
  detail(
    @CurrentChild() child: ChildPrincipal,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Query('assignmentId', new ParseUUIDPipe({ optional: true })) assignmentId?: string,
  ) {
    return this.gameplay.gameDetail(child, versionId, assignmentId);
  }

  @Get('games/:versionId/assets/:assetId/read-url')
  @Permissions('PLAY_GAMES')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 180, ttl: 60000 } })
  readUrl(
    @CurrentChild() child: ChildPrincipal,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Param('assetId', ParseUUIDPipe) assetId: string,
  ) {
    return this.gameplay.assetReadUrl(child, versionId, assetId);
  }

  @Post('sessions')
  @Permissions('PLAY_GAMES')
  start(@CurrentChild() child: ChildPrincipal, @Body() value: unknown) {
    const parsed = startPlaySessionSchema.safeParse(value);
    if (!parsed.success)
      throw new BadRequestException('Yêu cầu bắt đầu lượt chơi không hợp lệ.');
    return this.gameplay.start(child, parsed.data);
  }

  @Get('sessions/:sessionId')
  @Permissions('READ_OWN_PLAY_SESSIONS')
  get(
    @CurrentChild() child: ChildPrincipal,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return this.gameplay.get(child, sessionId);
  }

  @Post('sessions/:sessionId/events')
  @HttpCode(200)
  @Permissions('SUBMIT_OWN_INTERACTIONS')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 240, ttl: 60000 } })
  submit(
    @CurrentChild() child: ChildPrincipal,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() value: unknown,
  ) {
    const parsed = submitInteractionsSchema.safeParse(value);
    if (!parsed.success)
      throw new BadRequestException('Dữ liệu thao tác không hợp lệ.');
    return this.gameplay.submit(child, sessionId, parsed.data.events);
  }

  @Post('sessions/:sessionId/abandon')
  @HttpCode(200)
  @Permissions('SUBMIT_OWN_INTERACTIONS')
  abandon(
    @CurrentChild() child: ChildPrincipal,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return this.gameplay.abandon(child, sessionId);
  }
}
