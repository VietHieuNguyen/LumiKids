import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { createLessonPlanSchema, lessonPlanQuerySchema, saveLessonPlanSchema } from '@lumikids/shared';
import { CurrentUser, Permissions } from '../auth/decorators/auth.decorators.js';
import type { Principal } from '../../common/security/principal.js';
import { parse } from '../family/parse.js';
import { LessonPlansService } from './lesson-plans.service.js';

const INVALID = 'Kiểm tra tên giáo án, các phần nội dung và danh sách hoạt động (tối đa 30).';

@Controller('teacher/lesson-plans')
@Permissions('MANAGE_LESSON_PLANS')
export class LessonPlansController {
  constructor(private readonly plans: LessonPlansService) {}

  @Get()
  list(@CurrentUser() teacher: Principal, @Query() value: unknown) {
    return this.plans.list(teacher, parse(lessonPlanQuerySchema, value, 'Bộ lọc giáo án không hợp lệ.'));
  }
  @Post()
  create(@CurrentUser() teacher: Principal, @Body() value: unknown) {
    return this.plans.create(teacher, parse(createLessonPlanSchema, value, INVALID));
  }
  @Get(':lessonPlanId')
  detail(@CurrentUser() teacher: Principal, @Param('lessonPlanId', ParseUUIDPipe) id: string) {
    return this.plans.detail(teacher, id);
  }
  @Put(':lessonPlanId')
  save(
    @CurrentUser() teacher: Principal,
    @Param('lessonPlanId', ParseUUIDPipe) id: string,
    @Body() value: unknown,
  ) {
    return this.plans.save(teacher, id, parse(saveLessonPlanSchema, value, INVALID));
  }
  @Post(':lessonPlanId/duplicate')
  duplicate(@CurrentUser() teacher: Principal, @Param('lessonPlanId', ParseUUIDPipe) id: string) {
    return this.plans.duplicate(teacher, id);
  }
  @Delete(':lessonPlanId')
  @HttpCode(200)
  async remove(@CurrentUser() teacher: Principal, @Param('lessonPlanId', ParseUUIDPipe) id: string) {
    await this.plans.remove(teacher, id);
    return null;
  }
}
