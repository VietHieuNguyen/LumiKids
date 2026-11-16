import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AdminClassroomsController } from './admin-classrooms.controller.js';
import { ClassroomsRepository } from './classrooms.repository.js';
import { ClassroomsService } from './classrooms.service.js';
import { TeacherClassroomsController } from './teacher-classrooms.controller.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AdminClassroomsController, TeacherClassroomsController],
  providers: [ClassroomsRepository, ClassroomsService],
  exports: [ClassroomsService],
})
export class ClassroomsModule {}
