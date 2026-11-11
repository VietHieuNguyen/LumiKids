import {
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
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import authConfig from '../../common/config/auth.config.js';
import type { Principal } from '../../common/security/principal.js';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
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
