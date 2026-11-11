import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import storageConfig from '../config/storage.config.js';
import { StorageService } from './storage.service.js';

@Module({
  imports: [ConfigModule.forFeature(storageConfig)],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
