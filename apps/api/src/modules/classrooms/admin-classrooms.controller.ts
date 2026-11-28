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
  Put,
  Query,
} from '@nestjs/common';
import type { z } from 'zod';
import {
  addClassroomTeacherSchema,
  classroomQuerySchema,
  childLoginLockRequestSchema,
  createChildSchema,
  createClassroomSchema,
  createSchoolYearSchema,
  adminChildFilterSchema,
  adminChildQuerySchema,
  childStatusBatchSchema,
  enrollmentBatchSchema,
  playHistoryQuerySchema,
  reorderAgeGroupsSchema,
  updateAgeGroupSchema,
  transferChildSchema,
  updateChildSchema,
  updateClassroomSchema,
  updateSchoolYearSchema,
} from '@lumikids/shared';
import { CurrentUser, Permissions } from '../auth/decorators/auth.decorators.js';
import type { Principal } from '../../common/security/principal.js';
import { ClassroomsService } from './classrooms.service.js';

function parse<T extends z.ZodType>(
  schema: T,
  value: unknown,
  message: string,
): z.infer<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new BadRequestException(message);
  return parsed.data;
}

/** School administration: school years, classes, their teachers and the children in them. */
@Controller('admin')
@Permissions('MANAGE_CLASSROOMS')
export class AdminClassroomsController {
  constructor(private readonly classrooms: ClassroomsService) {}

  /** Age groups in display order, with how many classes, games and lesson plans use each. */
  @Get('age-groups')
  ageGroups() {
    return this.classrooms.ageGroupUsage();
  }
  @Patch('age-groups/:ageGroupId')
  renameAgeGroup(
    @Param('ageGroupId') ageGroupId: string,
    @Body() value: unknown,
  ) {
    return this.classrooms.renameAgeGroup(
      ageGroupId,
      parse(updateAgeGroupSchema, value, 'Tên nhóm tuổi cần 1–50 kí tự.'),
    );
  }
  @Put('age-groups/order')
  reorderAgeGroups(@Body() value: unknown) {
    return this.classrooms.reorderAgeGroups(
      parse(reorderAgeGroupsSchema, value, 'Thứ tự nhóm tuổi không hợp lệ.'),
    );
  }

  /** School years, newest first, with their classes and the children enrolled now. */
  @Get('school-years')
  schoolYears() {
    return this.classrooms.schoolYearUsage();
  }
  @Post('school-years')
  createSchoolYear(@Body() value: unknown) {
    return this.classrooms.createSchoolYear(
      parse(
        createSchoolYearSchema,
        value,
        'Kiểm tra tên năm học và ngày bắt đầu/kết thúc.',
      ),
    );
  }
  @Patch('school-years/:schoolYearId')
  updateSchoolYear(
    @Param('schoolYearId', ParseUUIDPipe) schoolYearId: string,
    @Body() value: unknown,
  ) {
    return this.classrooms.updateSchoolYear(
      schoolYearId,
      parse(updateSchoolYearSchema, value, 'Thông tin năm học không hợp lệ.'),
    );
  }

  @Get('teachers')
  teachers() {
    return this.classrooms.listTeachers();
  }

  @Get('classrooms')
  list(@Query() value: unknown) {
    return this.classrooms.listClassrooms(
      parse(classroomQuerySchema, value, 'Bộ lọc lớp học không hợp lệ.'),
    );
  }
  @Post('classrooms')
  create(@Body() value: unknown) {
    return this.classrooms.createClassroom(
      parse(
        createClassroomSchema,
        value,
        'Kiểm tra tên lớp, năm học và nhóm tuổi.',
      ),
    );
  }
  @Get('classrooms/:classId')
  detail(@Param('classId', ParseUUIDPipe) classId: string) {
    return this.classrooms.classroom(classId);
  }
  @Patch('classrooms/:classId')
  update(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body() value: unknown,
  ) {
    return this.classrooms.updateClassroom(
      classId,
      parse(updateClassroomSchema, value, 'Thông tin lớp học không hợp lệ.'),
    );
  }
  @Post('classrooms/:classId/teachers')
  addTeacher(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body() value: unknown,
  ) {
    const { userId } = parse(
      addClassroomTeacherSchema,
      value,
      'Chọn một giáo viên.',
    );
    return this.classrooms.addTeacher(classId, userId);
  }
  @Delete('classrooms/:classId/teachers/:userId')
  removeTeacher(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.classrooms.removeTeacher(classId, userId);
  }
  /** Read-only: a child's results while in this class (codes and assignments stay with teachers). */
  @Get('classrooms/:classId/children/:childId')
  classChild(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('childId', ParseUUIDPipe) childId: string,
  ) {
    return this.classrooms.classChild(classId, childId);
  }
  @Get('classrooms/:classId/children/:childId/play-sessions')
  classPlayHistory(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('childId', ParseUUIDPipe) childId: string,
    @Query() value: unknown,
  ) {
    return this.classrooms.classPlayHistory(
      classId,
      childId,
      parse(playHistoryQuerySchema, value, 'Bộ lọc lịch sử chơi không hợp lệ.'),
    );
  }

  @Get('children')
  children(@Query() value: unknown) {
    return this.classrooms.pageChildren(parse(adminChildQuerySchema, value, 'Bộ lọc danh sách trẻ không hợp lệ.'));
  }
  @Get('children/ids')
  childIds(@Query() value: unknown) {
    return this.classrooms.childIds(parse(adminChildFilterSchema, value, 'Bộ lọc danh sách trẻ không hợp lệ.'));
  }
  @Post('children/status/batch')
  @HttpCode(200)
  setChildrenStatus(@Body() value: unknown) {
    const { childIds, status } = parse(childStatusBatchSchema, value, 'Chọn trẻ và trạng thái hợp lệ.');
    return this.classrooms.setChildrenStatus(childIds, status);
  }
  @Get('children/unassigned')
  unassignedChildren() {
    return this.classrooms.listUnassignedChildren();
  }
  @Post('children/enrollments/batch')
  @HttpCode(200)
  enrollBatch(@Body() value: unknown) {
    const { classId, childIds } = parse(enrollmentBatchSchema, value, 'Chọn lớp và danh sách trẻ hợp lệ.');
    return this.classrooms.enrollSchoolChildren(classId, childIds);
  }

  @Get('children/:childId/login-lock')
  loginLockState(@Param('childId', ParseUUIDPipe) childId: string) {
    return this.classrooms.currentChildLoginLock(childId);
  }

  @Post('children/:childId/login-lock')
  lockLogin(
    @CurrentUser() admin: Principal,
    @Param('childId', ParseUUIDPipe) childId: string,
    @Body() value: unknown,
  ) {
    const { reason } = parse(childLoginLockRequestSchema, value, 'Nhập lý do khóa (3–500 ký tự).');
    return this.classrooms.lockChildLogin(admin, childId, reason);
  }

  @Post('children/:childId/login-unlock')
  unlockLogin(@CurrentUser() admin: Principal, @Param('childId', ParseUUIDPipe) childId: string) {
    return this.classrooms.unlockChildLogin(admin, childId);
  }

  @Post('children/:childId/login-code')
  issueLoginCode(@CurrentUser() admin: Principal, @Param('childId', ParseUUIDPipe) childId: string) {
    return this.classrooms.issueChildCodeAsAdmin(admin, childId);
  }

  @Post('children')
    createChild(@Body() value: unknown) {
    return this.classrooms.createChild(
      parse(
        createChildSchema,
        value,
        'Kiểm tra họ tên, ngày sinh, giới tính và lớp của trẻ.',
      ),
    );
  }
  @Patch('children/:childId')
  updateChild(
    @Param('childId', ParseUUIDPipe) childId: string,
    @Body() value: unknown,
  ) {
    return this.classrooms.updateChild(
      childId,
      parse(updateChildSchema, value, 'Thông tin của trẻ không hợp lệ.'),
    );
  }
  @Post('children/:childId/transfer')
  transfer(
    @Param('childId', ParseUUIDPipe) childId: string,
    @Body() value: unknown,
  ) {
    const { classId } = parse(
      transferChildSchema,
      value,
      'Chọn lớp mới cho trẻ.',
    );
    return this.classrooms.transferChild(childId, classId);
  }
}
