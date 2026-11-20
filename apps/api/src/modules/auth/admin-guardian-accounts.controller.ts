import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  bulkAccountStatusSchema,
  updateGuardianAccountSchema,
} from '@lumikids/shared';
import { Permissions } from './decorators/auth.decorators.js';
import { GuardianAccountsService } from './guardian-accounts.service.js';

/** Admin: family accounts (list, lock/unlock, reset password). */
@Controller('admin/guardian-accounts')
@Permissions('MANAGE_USERS')
export class AdminGuardianAccountsController {
  constructor(private readonly accounts: GuardianAccountsService) {}

  @Get()
  list() {
    return this.accounts.list();
  }

  /** Deactivate or reactivate up to 100 accounts in one transaction; reports what was skipped. */
  @Post('bulk-status')
  @HttpCode(200)
  bulkStatus(@Body() value: unknown) {
    const parsed = bulkAccountStatusSchema.safeParse(value);
    if (!parsed.success)
      throw new BadRequestException(
        'Chọn 1–100 tài khoản và trạng thái hợp lệ.',
      );
    return this.accounts.bulkStatus(parsed.data);
  }

  @Get(':userId')
  detail(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.accounts.detail(userId);
  }

  @Patch(':userId')
  update(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() value: unknown,
  ) {
    const parsed = updateGuardianAccountSchema.safeParse(value);
    if (!parsed.success)
      throw new BadRequestException('Trạng thái tài khoản không hợp lệ.');
    return this.accounts.update(userId, parsed.data);
  }

  @Post(':userId/password-reset')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  resetPassword(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.accounts.resetPassword(userId);
  }
}
