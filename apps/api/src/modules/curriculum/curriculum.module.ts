import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { CurriculumController } from './curriculum.controller.js';
import { CurriculumService } from './curriculum.service.js';
import { CurriculumRepository } from './curriculum.repository.js';

@Module({
  imports: [PrismaModule],
  controllers: [CurriculumController],
  providers: [CurriculumService, CurriculumRepository],
  exports: [CurriculumService],
})
export class CurriculumModule {}
