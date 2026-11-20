import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { LessonPlansController } from './lesson-plans.controller.js';
import { LessonPlansRepository } from './lesson-plans.repository.js';
import { LessonPlansService } from './lesson-plans.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [LessonPlansController],
  providers: [LessonPlansRepository, LessonPlansService],
})
export class LessonPlansModule {}
