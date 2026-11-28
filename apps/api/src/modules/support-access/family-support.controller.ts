import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { createSupportGrantSchema } from '@lumikids/shared';
import type { Principal } from '../../common/security/principal.js';
import { CurrentUser, Permissions } from '../auth/decorators/auth.decorators.js';
import { SupportAccessService } from './support-access.service.js';

/** The guardian decides whether support may look at a home child, and for how long. */
@Controller('family/children/:childId/support-grants')
@Permissions('MANAGE_FAMILY')
export class FamilySupportController {
  constructor(private readonly support: SupportAccessService) {}

  @Get()
  list(@CurrentUser() guardian: Principal, @Param('childId', ParseUUIDPipe) childId: string) {
    return this.support.list(guardian, childId);
  }

  @Post()
  grant(
    @CurrentUser() guardian: Principal,
    @Param('childId', ParseUUIDPipe) childId: string,
    @Body() value: unknown,
  ) {
    const parsed = createSupportGrantSchema.safeParse(value);
    if (!parsed.success)
      throw new BadRequestException('Thời hạn hỗ trợ phải từ 1 đến 72 giờ.');
    return this.support.grant(guardian, childId, parsed.data);
  }

  @Post(':grantId/revoke')
  revoke(
    @CurrentUser() guardian: Principal,
    @Param('childId', ParseUUIDPipe) childId: string,
    @Param('grantId', ParseUUIDPipe) grantId: string,
  ) {
    return this.support.revoke(guardian, childId, grantId);
  }
}
