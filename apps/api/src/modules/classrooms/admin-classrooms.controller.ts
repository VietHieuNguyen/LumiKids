import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { z } from 'zod';
import {
  addClassroomTeacherSchema,
  classroomQuerySchema,
  createChildSchema,
  createClassroomSchema,
  createSchoolYearSchema,
  transferChildSchema,
  updateChildSchema,
  updateClassroomSchema,
  updateSchoolYearSchema,
} from '@lumikids/shared';
import { Permissions } from '../auth/decorators/auth.decorators.js';
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

  @Get('age-groups')
  ageGroups() {
    return this.classrooms.listAgeGroups();
  }

  @Get('school-years')
  schoolYears() {
    return this.classrooms.listSchoolYears();
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

  @Get('children/unassigned')
  unassignedChildren() {
    return this.classrooms.listUnassignedChildren();
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
