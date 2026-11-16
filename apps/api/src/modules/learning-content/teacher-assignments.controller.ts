import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  createAssignmentSchema,
  decideReplaySchema,
  extendAssignmentSchema,
  updateAssignmentSchema,
} from '@lumikids/shared';
import {
  CurrentUser,
  Permissions,
} from '../auth/decorators/auth.decorators.js';
import type { Principal } from '../../common/security/principal.js';
import { AssignmentsService } from './assignments.service.js';

/** Assignments of one class; membership is checked per request by the classrooms service. */
@Controller('teacher/classrooms/:classId/assignments')
@Permissions('READ_OWN_CLASSROOMS')
export class TeacherAssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Get()
  list(
    @CurrentUser() teacher: Principal,
    @Param('classId', ParseUUIDPipe) classId: string,
  ) {
    return this.assignments.list(teacher, classId);
  }
  @Post()
  @Permissions('READ_OWN_CLASSROOMS', 'ASSIGN_ACTIVITIES')
  create(
    @CurrentUser() teacher: Principal,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body() value: unknown,
  ) {
    const parsed = createAssignmentSchema.safeParse(value);
    if (!parsed.success)
      throw new BadRequestException(
        'Kiểm tra tên bài, trò chơi (1–10 trò), người nhận và thời hạn.',
      );
    return this.assignments.create(teacher, classId, parsed.data);
  }
  @Get(':assignmentId')
  detail(
    @CurrentUser() teacher: Principal,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
  ) {
    return this.assignments.detail(teacher, classId, assignmentId);
  }
  @Patch(':assignmentId')
  @Permissions('READ_OWN_CLASSROOMS', 'ASSIGN_ACTIVITIES')
  update(
    @CurrentUser() teacher: Principal,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() value: unknown,
  ) {
    const parsed = updateAssignmentSchema.safeParse(value);
    if (!parsed.success)
      throw new BadRequestException('Thông tin bài giao không hợp lệ.');
    return this.assignments.update(teacher, classId, assignmentId, parsed.data);
  }
  @Post(':assignmentId/extend')
  @Permissions('READ_OWN_CLASSROOMS', 'ASSIGN_ACTIVITIES')
  extend(
    @CurrentUser() teacher: Principal,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() value: unknown,
  ) {
    const parsed = extendAssignmentSchema.safeParse(value);
    if (!parsed.success) throw new BadRequestException('Chọn trẻ và hạn mới.');
    return this.assignments.extend(teacher, classId, assignmentId, parsed.data);
  }
  @Post(':assignmentId/replay-requests/:requestId/decision')
  @Permissions('READ_OWN_CLASSROOMS', 'ASSIGN_ACTIVITIES')
  decide(
    @CurrentUser() teacher: Principal,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() value: unknown,
  ) {
    const parsed = decideReplaySchema.safeParse(value);
    if (!parsed.success)
      throw new BadRequestException('Đồng ý cần kèm hạn mới.');
    return this.assignments.decideReplay(
      teacher,
      classId,
      assignmentId,
      requestId,
      parsed.data,
    );
  }
}
