import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import familyConfig from '../../common/config/family.config.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ClassroomsModule } from '../classrooms/classrooms.module.js';
import { LearningContentModule } from '../learning-content/learning-content.module.js';
import { ClassInvitesService } from './class-invites.service.js';
import { FamilyController } from './family.controller.js';
import { FamilyRepository } from './family.repository.js';
import { FamilyService } from './family.service.js';
import { TeacherClassInvitesController } from './teacher-class-invites.controller.js';

@Module({
  imports: [
    ConfigModule.forFeature(familyConfig),
    PrismaModule,
    AuthModule,
    ClassroomsModule,
    LearningContentModule,
  ],
  controllers: [FamilyController, TeacherClassInvitesController],
  providers: [FamilyRepository, FamilyService, ClassInvitesService],
})
export class FamilyModule {}
