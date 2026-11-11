import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import type { ConfigType } from '@nestjs/config';
import { AiClient } from '@lumikids/ai-client';
import aiConfig from '../../common/config/ai.config.js';
import { GameAssetModule } from '../game-assets/game-asset.module.js';
import { GameGenerationController } from './game-generation.controller.js';
import { GameGenerationService } from './game-generation.service.js';
import { GamePreviewAccessService } from './game-preview-access.service.js';
import { JwtModule } from '@nestjs/jwt';
import authConfig from '../../common/config/auth.config.js';

@Module({
  imports: [
    ConfigModule.forFeature(aiConfig),
    ConfigModule.forFeature(authConfig),
    JwtModule.register({}),
    GameAssetModule,
  ],
  controllers: [GameGenerationController],
  providers: [
    GameGenerationService,
    GamePreviewAccessService,
    {
      provide: AiClient,
      inject: [aiConfig.KEY],
      useFactory: (config: ConfigType<typeof aiConfig>) =>
        new AiClient({
          baseUrl: config.url ?? '',
          token: config.token ?? '',
          timeoutMs: config.timeoutMs,
        }),
    },
  ],
})
export class GameGenerationModule {}
