import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  gameLibraryQuerySchema,
  gameStatusSchema,
  saveGameSchema,
} from '@lumikids/shared';
import {
  CurrentUser,
  Permissions,
} from '../auth/decorators/auth.decorators.js';
import type { Principal } from '../../common/security/principal.js';
import { GameLibraryService } from './game-library.service.js';

@Controller('game-library')
export class GameLibraryController {
  constructor(private readonly games: GameLibraryService) {}
  @Get()
  @Permissions('READ_GAMES')
  list(@CurrentUser() user: Principal, @Query() value: unknown) {
    const parsed = gameLibraryQuerySchema.safeParse(value);
    if (!parsed.success)
      throw new BadRequestException('Bộ lọc kho trò chơi không hợp lệ.');
    return this.games.list(user, parsed.data);
  }
  @Post()
  @Permissions('READ_GAMES', 'SAVE_GAMES', 'GENERATE_GAME_CONTENT')
  save(@CurrentUser() user: Principal, @Body() value: unknown) {
    const parsed = saveGameSchema.safeParse(value);
    if (!parsed.success)
      throw new BadRequestException(
        'Kiểm tra tên trò chơi, độ khó, chỉ số và xác nhận duyệt nội dung.',
      );
    return this.games.save(user, parsed.data);
  }
  @Get(':versionId')
  @Permissions('READ_GAMES')
  detail(
    @CurrentUser() user: Principal,
    @Param('versionId', ParseUUIDPipe) id: string,
  ) {
    return this.games.detail(user, id);
  }
  @Patch(':versionId/status')
  @Permissions('READ_GAMES')
  status(
    @CurrentUser() user: Principal,
    @Param('versionId', ParseUUIDPipe) id: string,
    @Body() value: unknown,
  ) {
    const parsed = gameStatusSchema.safeParse(value);
    if (!parsed.success)
      throw new BadRequestException('Trạng thái trò chơi không hợp lệ.');
    return this.games.status(user, id, parsed.data.status);
  }
  @Get(':versionId/assets/:assetId/read-url')
  @Permissions('READ_GAMES')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 180, ttl: 60000 } })
  readUrl(
    @CurrentUser() user: Principal,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Param('assetId', ParseUUIDPipe) assetId: string,
  ) {
    return this.games.readUrl(user, versionId, assetId);
  }
}
