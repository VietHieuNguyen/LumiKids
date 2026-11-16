import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { playHistoryQuerySchema } from '@lumikids/shared';
import {
  CurrentUser,
  Permissions,
} from '../auth/decorators/auth.decorators.js';
import type { Principal } from '../../common/security/principal.js';
import { ClassroomsService } from './classrooms.service.js';

/** A teacher's own classes. Membership is checked per request against ClassroomTeacher. */
@Controller('teacher/classrooms')
@Permissions('READ_OWN_CLASSROOMS')
export class TeacherClassroomsController {
  constructor(private readonly classrooms: ClassroomsService) {}

  @Get()
  list(@CurrentUser() teacher: Principal) {
    return this.classrooms.teacherClassrooms(teacher);
  }
  @Get(':classId')
  detail(
    @CurrentUser() teacher: Principal,
    @Param('classId', ParseUUIDPipe) classId: string,
  ) {
    return this.classrooms.teacherClassroom(teacher, classId);
  }
  @Get(':classId/children/:childId')
  child(
    @CurrentUser() teacher: Principal,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('childId', ParseUUIDPipe) childId: string,
  ) {
    return this.classrooms.teacherChild(teacher, classId, childId);
  }
  @Get(':classId/children/:childId/play-sessions')
  playHistory(
    @CurrentUser() teacher: Principal,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('childId', ParseUUIDPipe) childId: string,
    @Query() value: unknown,
  ) {
    const parsed = playHistoryQuerySchema.safeParse(value);
    if (!parsed.success)
      throw new BadRequestException('Bộ lọc lịch sử chơi không hợp lệ.');
    return this.classrooms.teacherPlayHistory(
      teacher,
      classId,
      childId,
      parsed.data,
    );
  }
  /** The new code is in this response only; never cached. */
  @Post(':classId/children/:childId/login-code')
  @Permissions('READ_OWN_CLASSROOMS', 'RESET_CHILD_LOGIN_CODES')
  @Header('Cache-Control', 'no-store')
  issueLoginCode(
    @CurrentUser() teacher: Principal,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('childId', ParseUUIDPipe) childId: string,
  ) {
    return this.classrooms.issueLoginCode(teacher, classId, childId);
  }
}
