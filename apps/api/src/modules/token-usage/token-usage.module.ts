import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { TokenUsageController } from './token-usage.controller.js';
import { TokenUsageService } from './token-usage.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [TokenUsageController],
  providers: [TokenUsageService],
  exports: [TokenUsageService],
})
export class TokenUsageModule {}
