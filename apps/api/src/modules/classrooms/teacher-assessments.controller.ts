import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  createTeacherAssessmentSchema,
  updateTeacherAssessmentSchema,
} from '@lumikids/shared';
import type { Principal } from '../../common/security/principal.js';
import { CurrentUser, Permissions } from '../auth/decorators/auth.decorators.js';
import { TeacherAssessmentsService } from './teacher-assessments.service.js';

/** FR-3.1: a teacher's notes on a child in their class. Same class-membership check as the rest of the teacher routes. */
@Controller('teacher/classrooms/:classId/children/:childId/assessments')
@Permissions('READ_OWN_CLASSROOMS')
export class TeacherAssessmentsController {
  constructor(private readonly assessments: TeacherAssessmentsService) {}

  @Get()
  list(
    @CurrentUser() teacher: Principal,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('childId', ParseUUIDPipe) childId: string,
  ) {
    return this.assessments.list(teacher, classId, childId);
  }

  @Post()
  create(
    @CurrentUser() teacher: Principal,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('childId', ParseUUIDPipe) childId: string,
    @Body() value: unknown,
  ) {
    const parsed = createTeacherAssessmentSchema.safeParse(value);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Nhận xét không hợp lệ.');
    return this.assessments.create(teacher, classId, childId, parsed.data);
  }

  @Get(':assessmentId')
  detail(
    @CurrentUser() teacher: Principal,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('childId', ParseUUIDPipe) childId: string,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
  ) {
    return this.assessments.detail(teacher, classId, childId, assessmentId);
  }

  @Patch(':assessmentId')
  update(
    @CurrentUser() teacher: Principal,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('childId', ParseUUIDPipe) childId: string,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
    @Body() value: unknown,
  ) {
    const parsed = updateTeacherAssessmentSchema.safeParse(value);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Nhận xét không hợp lệ.');
    return this.assessments.update(teacher, classId, childId, assessmentId, parsed.data);
  }

  @Post(':assessmentId/publish')
  @HttpCode(200)
  publish(
    @CurrentUser() teacher: Principal,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('childId', ParseUUIDPipe) childId: string,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
  ) {
    return this.assessments.publish(teacher, classId, childId, assessmentId);
  }

  @Delete(':assessmentId')
  @HttpCode(200)
  remove(
    @CurrentUser() teacher: Principal,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('childId', ParseUUIDPipe) childId: string,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
  ) {
    return this.assessments.remove(teacher, classId, childId, assessmentId);
  }
}
