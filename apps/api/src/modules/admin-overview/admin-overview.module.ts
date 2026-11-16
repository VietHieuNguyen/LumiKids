import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { AdminOverviewController } from './admin-overview.controller.js';
import { AdminOverviewRepository } from './admin-overview.repository.js';
import { AdminOverviewService } from './admin-overview.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [AdminOverviewController],
  providers: [AdminOverviewService, AdminOverviewRepository],
})
export class AdminOverviewModule {}
