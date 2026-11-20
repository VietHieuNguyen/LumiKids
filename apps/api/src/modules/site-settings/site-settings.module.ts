import { Module } from '@nestjs/common';
import { StorageModule } from '../../common/storage/storage.module.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import {
  AdminSiteSettingsController,
  SiteSettingsController,
} from './site-settings.controller.js';
import { SiteSettingsRepository } from './site-settings.repository.js';
import { SiteSettingsService } from './site-settings.service.js';

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [SiteSettingsController, AdminSiteSettingsController],
  providers: [SiteSettingsRepository, SiteSettingsService],
})
export class SiteSettingsModule {}
