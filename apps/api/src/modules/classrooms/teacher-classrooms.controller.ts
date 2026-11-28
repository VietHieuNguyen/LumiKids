import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  HttpCode,
  Patch,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  childBatchSchema,
  createClassGroupSchema,
  playHistoryQuerySchema,
  updateClassGroupSchema,
} from '@lumikids/shared';
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
  /** Running sign-in locks on the children of this class: the teacher is told why. */
  @Get(':classId/login-locks')
  loginLocks(@CurrentUser() teacher: Principal, @Param('classId', ParseUUIDPipe) classId: string) {
    return this.classrooms.teacherLoginLocks(teacher, classId);
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
  @Get(':classId/groups')
  groups(
    @CurrentUser() teacher: Principal,
    @Param('classId', ParseUUIDPipe) classId: string,
  ) {
    return this.classrooms.listGroups(teacher, classId);
  }
  @Post(':classId/groups')
  @Permissions('READ_OWN_CLASSROOMS', 'ASSIGN_ACTIVITIES')
  createGroup(
    @CurrentUser() teacher: Principal,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body() value: unknown,
  ) {
    const parsed = createClassGroupSchema.safeParse(value);
    if (!parsed.success)
      throw new BadRequestException('Kiểm tra tên nhóm và danh sách trẻ.');
    return this.classrooms.createGroup(teacher, classId, parsed.data);
  }
  @Patch(':classId/groups/:groupId')
  @Permissions('READ_OWN_CLASSROOMS', 'ASSIGN_ACTIVITIES')
  updateGroup(
    @CurrentUser() teacher: Principal,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() value: unknown,
  ) {
    const parsed = updateClassGroupSchema.safeParse(value);
    if (!parsed.success)
      throw new BadRequestException('Kiểm tra tên nhóm và danh sách trẻ.');
    return this.classrooms.updateGroup(teacher, classId, groupId, parsed.data);
  }
  @Delete(':classId/groups/:groupId')
  @Permissions('READ_OWN_CLASSROOMS', 'ASSIGN_ACTIVITIES')
  @HttpCode(200)
  async deleteGroup(
    @CurrentUser() teacher: Principal,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ) {
    await this.classrooms.deleteGroup(teacher, classId, groupId);
    return null;
  }
  @Post(':classId/children/initial-login-codes')
  @Permissions('READ_OWN_CLASSROOMS', 'RESET_CHILD_LOGIN_CODES')
  @Header('Cache-Control', 'no-store')
  issueInitialCodes(
    @CurrentUser() teacher: Principal,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body() value: unknown,
  ) {
    const parsed = childBatchSchema.safeParse(value);
    if (!parsed.success) throw new BadRequestException('Danh sách trẻ cần cấp mã không hợp lệ.');
    return this.classrooms.issueInitialCodes(teacher, classId, parsed.data.childIds);
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
