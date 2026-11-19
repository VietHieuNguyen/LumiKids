import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Query,
} from '@nestjs/common';
import { tokenUsageQuerySchema } from '@lumikids/shared';
import type { Principal } from '../../common/security/principal.js';
import {
  CurrentUser,
  Permissions,
  Roles,
} from '../auth/decorators/auth.decorators.js';
import { TokenUsageService } from './token-usage.service.js';

function parse(query: unknown) {
  const result = tokenUsageQuerySchema.safeParse(query);
  if (!result.success)
    throw new BadRequestException(
      'Khoảng ngày hoặc bộ lọc không hợp lệ (tối đa 366 ngày).',
    );
  return result.data;
}
@Controller('token-usage')
export class TokenUsageController {
  constructor(private readonly usage: TokenUsageService) {}
  @Get('me')
  @Permissions('READ_OWN_ACCOUNT')
  @Header('Cache-Control', 'no-store')
  mine(@CurrentUser() user: Principal, @Query() query: unknown) {
    return this.usage.report(user, parse(query), false);
  }
  @Get('teachers')
  @Roles('ROLE_ADMIN')
  @Permissions('MANAGE_USERS')
  @Header('Cache-Control', 'no-store')
  teachers(@CurrentUser() user: Principal, @Query() query: unknown) {
    return this.usage.report(user, parse(query), true);
  }
}
