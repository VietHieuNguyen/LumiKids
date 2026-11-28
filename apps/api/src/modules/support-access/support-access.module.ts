import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { AdminSupportController } from './admin-support.controller.js';
import { FamilySupportController } from './family-support.controller.js';
import { SupportAccessRepository } from './support-access.repository.js';
import { SupportAccessService } from './support-access.service.js';

@Module({
  imports: [PrismaModule, AuthModule, AuditModule],
  controllers: [FamilySupportController, AdminSupportController],
  providers: [SupportAccessRepository, SupportAccessService],
})
export class SupportAccessModule {}
