import { TeacherAssessmentsController } from './teacher-assessments.controller.js';
import { TeacherAssessmentsRepository } from './teacher-assessments.repository.js';
import { TeacherAssessmentsService } from './teacher-assessments.service.js';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AdminClassroomsController } from './admin-classrooms.controller.js';
import { ClassroomsRepository } from './classrooms.repository.js';
import { ClassroomsService } from './classrooms.service.js';
import { TeacherClassroomsController } from './teacher-classrooms.controller.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [TeacherAssessmentsController, AdminClassroomsController, TeacherClassroomsController],
  providers: [ClassroomsRepository, ClassroomsService, TeacherAssessmentsRepository, TeacherAssessmentsService],
  exports: [ClassroomsService, TeacherAssessmentsService],
})
export class ClassroomsModule {}
