import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  createFamilyActivitySchema,
  createFamilyChildSchema,
  createJoinRequestSchema,
  inviteCodeSchema,
  playHistoryQuerySchema,
  updateFamilyChildSchema,
} from '@lumikids/shared';
import { CurrentUser, Permissions } from '../auth/decorators/auth.decorators.js';
import type { Principal } from '../../common/security/principal.js';
import { FamilyService } from './family.service.js';
import { parse } from './parse.js';

/** The guardian's area. Every child route checks the GuardianChild link of the signed-in guardian. */
@Controller('family')
@Permissions('MANAGE_FAMILY')
export class FamilyController {
  constructor(private readonly family: FamilyService) {}

  @Get('children')
  children(@CurrentUser() guardian: Principal) {
    return this.family.children(guardian);
  }
  @Post('children')
  createChild(@CurrentUser() guardian: Principal, @Body() value: unknown) {
    return this.family.createChild(
      guardian,
      parse(createFamilyChildSchema, value, 'Kiểm tra họ tên, ngày sinh và giới tính của trẻ.'),
    );
  }
  @Patch('children/:childId')
  updateChild(
    @CurrentUser() guardian: Principal,
    @Param('childId', ParseUUIDPipe) childId: string,
    @Body() value: unknown,
  ) {
    return this.family.updateChild(
      guardian,
      childId,
      parse(updateFamilyChildSchema, value, 'Kiểm tra họ tên, ngày sinh và giới tính của trẻ.'),
    );
  }
  @Post('children/:childId/login-code')
  @Header('Cache-Control', 'no-store')
  issueLoginCode(
    @CurrentUser() guardian: Principal,
    @Param('childId', ParseUUIDPipe) childId: string,
  ) {
    return this.family.issueLoginCode(guardian, childId);
  }
  @Get('children/:childId/play-sessions')
  playHistory(
    @CurrentUser() guardian: Principal,
    @Param('childId', ParseUUIDPipe) childId: string,
    @Query() value: unknown,
  ) {
    return this.family.playHistory(
      guardian,
      childId,
      parse(playHistoryQuerySchema, value, 'Bộ lọc lịch sử chơi không hợp lệ.'),
    );
  }
  @Get('children/:childId/activities')
  activities(
    @CurrentUser() guardian: Principal,
    @Param('childId', ParseUUIDPipe) childId: string,
  ) {
    return this.family.activities(guardian, childId);
  }
  @Post('children/:childId/activities')
  @Permissions('MANAGE_FAMILY', 'READ_GAMES')
  createActivity(
    @CurrentUser() guardian: Principal,
    @Param('childId', ParseUUIDPipe) childId: string,
    @Body() value: unknown,
  ) {
    return this.family.createActivity(
      guardian,
      childId,
      parse(createFamilyActivitySchema, value, 'Kiểm tra tên lượt chơi và các trò đã chọn (1–10 trò).'),
    );
  }
  @Post('children/:childId/activities/:assignmentId/cancel')
  @HttpCode(200)
  async cancelActivity(
    @CurrentUser() guardian: Principal,
    @Param('childId', ParseUUIDPipe) childId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
  ) {
    await this.family.cancelActivity(guardian, childId, assignmentId);
    return null;
  }
  @Post('children/:childId/leave-class')
  @HttpCode(200)
  leaveClass(
    @CurrentUser() guardian: Principal,
    @Param('childId', ParseUUIDPipe) childId: string,
  ) {
    return this.family.leaveClass(guardian, childId);
  }
  @Post('invites/preview')
  @HttpCode(200)
  previewInvite(@Body() value: unknown) {
    return this.family.previewInvite(parse(inviteCodeSchema, value, 'Mã mời không hợp lệ.').code);
  }
  @Post('join-requests')
  requestJoin(@CurrentUser() guardian: Principal, @Body() value: unknown) {
    return this.family.requestJoin(
      guardian,
      parse(createJoinRequestSchema, value, 'Cần mã mời, chọn trẻ và đồng ý chia sẻ dữ liệu.'),
    );
  }
}
