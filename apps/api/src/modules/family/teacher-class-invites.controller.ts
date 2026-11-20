import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { createClassInviteSchema, decideJoinRequestSchema } from '@lumikids/shared';
import { CurrentUser, Permissions } from '../auth/decorators/auth.decorators.js';
import type { Principal } from '../../common/security/principal.js';
import { ClassInvitesService } from './class-invites.service.js';
import { parse } from './parse.js';

/** Invitations of one of the teacher's classes and the guardians' join requests. */
@Controller('teacher/classrooms/:classId')
@Permissions('READ_OWN_CLASSROOMS', 'MANAGE_CLASS_INVITES')
export class TeacherClassInvitesController {
  constructor(private readonly invites: ClassInvitesService) {}

  @Get('invites')
  list(@CurrentUser() teacher: Principal, @Param('classId', ParseUUIDPipe) classId: string) {
    return this.invites.list(teacher, classId);
  }
  @Post('invites')
  @Header('Cache-Control', 'no-store')
  create(
    @CurrentUser() teacher: Principal,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body() value: unknown,
  ) {
    return this.invites.create(
      teacher,
      classId,
      parse(createClassInviteSchema, value ?? {}, 'Thời hạn 1–30 ngày, tối đa 1–200 lượt dùng.'),
    );
  }
  @Post('invites/:inviteId/revoke')
  @HttpCode(200)
  revoke(
    @CurrentUser() teacher: Principal,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('inviteId', ParseUUIDPipe) inviteId: string,
  ) {
    return this.invites.revoke(teacher, classId, inviteId);
  }
  @Get('join-requests')
  joinRequests(@CurrentUser() teacher: Principal, @Param('classId', ParseUUIDPipe) classId: string) {
    return this.invites.joinRequests(teacher, classId);
  }
  @Post('join-requests/:requestId/decision')
  @HttpCode(200)
  decide(
    @CurrentUser() teacher: Principal,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() value: unknown,
  ) {
    return this.invites.decide(
      teacher,
      classId,
      requestId,
      parse(decideJoinRequestSchema, value, 'Chọn duyệt hoặc từ chối.').approve,
    );
  }
}
