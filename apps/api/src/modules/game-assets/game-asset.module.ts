import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import type { ConfigType } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import storageConfig from '../../common/config/storage.config.js';
import { StorageModule } from '../../common/storage/storage.module.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { GameAssetController } from './game-asset.controller.js';
import { GameAssetRepository } from './game-asset.repository.js';
import { GameAssetService } from './game-asset.service.js';

@Module({
  imports: [
    PrismaModule,
    StorageModule,
    ConfigModule.forFeature(storageConfig),
    MulterModule.registerAsync({
      imports: [ConfigModule.forFeature(storageConfig)],
      inject: [storageConfig.KEY],
      useFactory: (config: ConfigType<typeof storageConfig>) => ({
        limits: {
          fileSize: config.maxSizeBytes,
          files: 1,
          fields: 4,
          // Busboy emits partsLimit as soon as the count reaches this value.
          // The normal form has 1 file + 4 fields; files/fields still cap it at 5.
          parts: 6,
          fieldSize: 16384,
          fieldNameSize: 100,
        },
      }),
    }),
  ],
  controllers: [GameAssetController],
  providers: [GameAssetRepository, GameAssetService],
  exports: [GameAssetService],
})
export class GameAssetModule {}
