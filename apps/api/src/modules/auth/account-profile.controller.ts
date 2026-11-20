import { BadRequestException, Body, Controller, Get, Patch } from '@nestjs/common';
import { updateAccountProfileSchema } from '@lumikids/shared';
import type { Principal } from '../../common/security/principal.js';
import { CurrentUser, Permissions } from './decorators/auth.decorators.js';
import { AccountProfileService } from './account-profile.service.js';

/** The signed-in adult's own profile. */
@Controller('auth/profile')
@Permissions('READ_OWN_ACCOUNT')
export class AccountProfileController {
  constructor(private readonly profiles: AccountProfileService) {}

  @Get()
  get(@CurrentUser() user: Principal) {
    return this.profiles.get(user);
  }

  @Patch()
  update(@CurrentUser() user: Principal, @Body() value: unknown) {
    const parsed = updateAccountProfileSchema.safeParse(value);
    if (!parsed.success)
      throw new BadRequestException('Kiểm tra lại họ tên (1–120 kí tự) và số điện thoại.');
    return this.profiles.update(user, parsed.data);
  }
}
