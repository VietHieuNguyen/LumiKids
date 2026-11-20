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
import type { z } from 'zod';
import {
  bulkAccountStatusSchema,
  createTeacherAccountSchema,
  updateTeacherAccountSchema,
} from '@lumikids/shared';
import { Permissions } from './decorators/auth.decorators.js';
import { TeacherAccountsService } from './teacher-accounts.service.js';

function parse<T extends z.ZodType>(
  schema: T,
  value: unknown,
  message: string,
): z.infer<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new BadRequestException(message);
  return parsed.data;
}

/** Admin: teacher accounts (create, edit, lock/unlock, reset password). */
@Controller('admin/teacher-accounts')
@Permissions('MANAGE_USERS')
export class AdminTeacherAccountsController {
  constructor(private readonly accounts: TeacherAccountsService) {}

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

  @Post()
  @Header('Cache-Control', 'no-store')
  create(@Body() value: unknown) {
    return this.accounts.create(
      parse(
        createTeacherAccountSchema,
        value,
        'Kiểm tra họ tên, email và số điện thoại.',
      ),
    );
  }

  @Patch(':userId')
  update(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() value: unknown,
  ) {
    return this.accounts.update(
      userId,
      parse(
        updateTeacherAccountSchema,
        value,
        'Thông tin giáo viên không hợp lệ.',
      ),
    );
  }

  @Post(':userId/password-reset')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  resetPassword(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.accounts.resetPassword(userId);
  }
}
