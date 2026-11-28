import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import type { Principal } from '../../common/security/principal.js';
import { CurrentUser, Permissions } from '../auth/decorators/auth.decorators.js';
import { SupportAccessService } from './support-access.service.js';

/** Support staff read a home child only while the guardian's grant runs. Every read is audited. */
@Controller('admin/support')
@Permissions('MANAGE_CLASSROOMS')
export class AdminSupportController {
  constructor(private readonly support: SupportAccessService) {}

  @Get('grants')
  listActive(@CurrentUser() staff: Principal) {
    return this.support.listActiveForStaff(staff);
  }

  @Get('children/:childId')
  view(@CurrentUser() staff: Principal, @Param('childId', ParseUUIDPipe) childId: string) {
    return this.support.viewForStaff(staff, childId);
  }
}
