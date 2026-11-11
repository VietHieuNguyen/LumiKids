import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  CurrentUser,
  Permissions,
} from '../auth/decorators/auth.decorators.js';
import type { Principal } from '../../common/security/principal.js';
import { GameAssetService } from './game-asset.service.js';
import type { AssetFile } from './game-asset.service.js';
import {
  AssetValidationPipe,
  createAssetSchema,
  listAssetsSchema,
  statusSchema,
  updateAssetSchema,
} from './dto/game-asset.dto.js';
import type {
  CreateAssetInput,
  ListAssetsInput,
  StatusInput,
  UpdateAssetInput,
} from './dto/game-asset.dto.js';

@Controller('game-assets')
export class GameAssetController {
  constructor(private readonly assets: GameAssetService) {}

  @Post()
  @Permissions('MANAGE_GAME_ASSETS')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @CurrentUser() user: Principal,
    @Body(new AssetValidationPipe(createAssetSchema)) dto: CreateAssetInput,
    @UploadedFile() file?: AssetFile,
  ) {
    return this.assets.upload(user, dto, file);
  }

  @Get()
  @Permissions('READ_GAME_ASSETS')
  list(
    @CurrentUser() user: Principal,
    @Query(new AssetValidationPipe(listAssetsSchema)) query: ListAssetsInput,
  ) {
    return this.assets.list(user, query);
  }

  @Get(':id')
  @Permissions('READ_GAME_ASSETS')
  detail(
    @CurrentUser() user: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.assets.detail(user, id);
  }

  @Patch(':id')
  @Permissions('MANAGE_GAME_ASSETS')
  update(
    @CurrentUser() user: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new AssetValidationPipe(updateAssetSchema)) dto: UpdateAssetInput,
  ) {
    return this.assets.update(user, id, dto);
  }

  @Patch(':id/status')
  @Permissions('MANAGE_GAME_ASSETS')
  status(
    @CurrentUser() user: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new AssetValidationPipe(statusSchema)) dto: StatusInput,
  ) {
    return this.assets.setStatus(user, id, dto.status);
  }

  @Get(':id/url')
  @Permissions('READ_GAME_ASSETS')
  url(@CurrentUser() user: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.assets.readUrl(user, id);
  }
}
