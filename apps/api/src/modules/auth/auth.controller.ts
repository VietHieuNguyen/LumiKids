import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import authConfig from '../../common/config/auth.config.js';
import type { Principal } from '../../common/security/principal.js';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import {
  changeOwnPasswordSchema,
  registerGuardianSchema,
  resendVerificationSchema,
  verifyEmailSchema,
} from '@lumikids/shared';
import { RegistrationService } from './registration.service.js';
import { TeacherAccountsService } from './teacher-accounts.service.js';
import {
  CurrentUser,
  Permissions,
  Public,
  Roles,
} from './decorators/auth.decorators.js';
import { BrowserRequestGuard } from './guards/browser-request.guard.js';

@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly accounts: TeacherAccountsService,
    private readonly registration: RegistrationService,
    @Inject(authConfig.KEY)
    private readonly config: ConfigType<typeof authConfig>,
  ) {}

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.cookieSecure,
      sameSite: this.config.cookieSameSite,
      path: this.config.cookiePath,
    };
  }

  private refreshCookie(request: Request): unknown {
    const cookies: unknown = request.cookies;
    if (typeof cookies !== 'object' || cookies === null) return undefined;
    return (cookies as Record<string, unknown>)[this.config.cookieName];
  }

  private reply(
    result: Awaited<ReturnType<AuthService['login']>>,
    response: Response,
  ) {
    response.cookie(this.config.cookieName, result.refresh, {
      ...this.cookieOptions(),
      expires: result.refreshExpiresAt,
    });
    response.setHeader('Cache-Control', 'no-store');
    return {
      accessToken: result.accessToken,
      tokenType: result.tokenType,
      expiresIn: result.expiresIn,
      user: result.user,
    };
  }

  @Post('login')
  @Public()
  @HttpCode(200)
  @UseGuards(BrowserRequestGuard)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.reply(await this.auth.login(dto), response);
  }

  /** Guardian self-registration (FR-1.6). Same answer whether or not the email has an account. */
  @Post('register')
  @Public()
  @HttpCode(202)
  @UseGuards(BrowserRequestGuard)
  @Throttle({ default: { ttl: 3_600_000, limit: 10 } })
  register(@Body() value: unknown) {
    const parsed = registerGuardianSchema.safeParse(value);
    if (!parsed.success)
      throw new BadRequestException(
        'Kiểm tra họ tên, email, quan hệ với trẻ và mật khẩu (10–128 kí tự).',
      );
    return this.registration.register(parsed.data);
  }

  @Post('verify-email')
  @Public()
  @HttpCode(200)
  @UseGuards(BrowserRequestGuard)
  async verifyEmail(@Body() value: unknown) {
    const parsed = verifyEmailSchema.safeParse(value);
    if (!parsed.success)
      throw new BadRequestException('Mã xác minh gồm 6 chữ số.');
    await this.registration.verify(parsed.data);
    return { verified: true };
  }

  @Post('verify-email/resend')
  @Public()
  @HttpCode(202)
  @UseGuards(BrowserRequestGuard)
  @Throttle({ default: { ttl: 3_600_000, limit: 10 } })
  resendVerification(@Body() value: unknown) {
    const parsed = resendVerificationSchema.safeParse(value);
    if (!parsed.success) throw new BadRequestException('Email không hợp lệ.');
    return this.registration.resend(parsed.data.email);
  }

  @Post('refresh-token')
  @Public()
  @HttpCode(200)
  @UseGuards(BrowserRequestGuard)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      return this.reply(
        await this.auth.refresh(this.refreshCookie(request)),
        response,
      );
    } catch (error) {
      response.clearCookie(this.config.cookieName, this.cookieOptions());
      throw error;
    }
  }

  @Post('logout')
  @Public()
  @HttpCode(200)
  @UseGuards(BrowserRequestGuard)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logout(this.refreshCookie(request));
    response.clearCookie(this.config.cookieName, this.cookieOptions());
    response.setHeader('Cache-Control', 'no-store');
    return null;
  }

  /** Change one's own password; every session of the account ends, so the client signs in again. */
  @Post('password')
  @HttpCode(200)
  @UseGuards(BrowserRequestGuard)
  @Permissions('READ_OWN_ACCOUNT')
  async changePassword(
    @CurrentUser() user: Principal,
    @Body() value: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const parsed = changeOwnPasswordSchema.safeParse(value);
    if (!parsed.success)
      throw new BadRequestException(
        'Mật khẩu mới cần 10–128 kí tự và khác mật khẩu cũ.',
      );
    await this.accounts.changeOwnPassword(user, parsed.data);
    response.clearCookie(this.config.cookieName, this.cookieOptions());
    response.setHeader('Cache-Control', 'no-store');
    return null;
  }

  @Get('me')
  @SkipThrottle()
  me(@CurrentUser() user: Principal) {
    return user;
  }

  @Get('authorization-check')
  @SkipThrottle()
  @Roles('ROLE_ADMIN')
  @Permissions('MANAGE_USERS')
  authorizationCheck() {
    return { allowed: true };
  }

  @Get('accounts/:userId')
  @SkipThrottle()
  @Permissions('READ_OWN_ACCOUNT')
  ownAccount(
    @CurrentUser() user: Principal,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.users.getOwnAccount(user, userId);
  }
}
