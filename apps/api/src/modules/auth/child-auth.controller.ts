import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import authConfig from '../../common/config/auth.config.js';
import childAuthConfig from '../../common/config/child-auth.config.js';
import type { ChildPrincipal } from '../../common/security/principal.js';
import { ChildAuthService } from './child-auth.service.js';
import { ChildLoginDto } from './dto/child-login.dto.js';
import {
  ChildRoute,
  CurrentChild,
  Public,
} from './decorators/auth.decorators.js';
import { BrowserRequestGuard } from './guards/browser-request.guard.js';

/**
 * Sign-in for children with a personal login code. Separate refresh cookie (name and path) from the adult
 * session, so a teacher and a child can be signed in on the same classroom device without clobbering each other.
 */
@Controller('auth/child')
@UseGuards(ThrottlerGuard)
export class ChildAuthController {
  constructor(
    private readonly children: ChildAuthService,
    @Inject(authConfig.KEY)
    private readonly auth: ConfigType<typeof authConfig>,
    @Inject(childAuthConfig.KEY)
    private readonly config: ConfigType<typeof childAuthConfig>,
  ) {}

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.auth.cookieSecure,
      sameSite: this.auth.cookieSameSite,
      path: this.config.cookiePath,
    };
  }

  private refreshCookie(request: Request): unknown {
    const cookies: unknown = request.cookies;
    if (typeof cookies !== 'object' || cookies === null) return undefined;
    return (cookies as Record<string, unknown>)[this.config.cookieName];
  }

  private reply(
    result: Awaited<ReturnType<ChildAuthService['login']>>,
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
      child: result.child,
    };
  }

  // A whole class signs in from one school network (one IP) within minutes, so this limit is higher than the
  // adult one; an 8-character code from 31 symbols (~8.5e11 values) still makes guessing impractical.
  @Post('login')
  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @UseGuards(BrowserRequestGuard)
  async login(
    @Body() dto: ChildLoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.reply(await this.children.login(dto.code), response);
  }

  @Post('refresh-token')
  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @UseGuards(BrowserRequestGuard)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      return this.reply(
        await this.children.refresh(this.refreshCookie(request)),
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
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @UseGuards(BrowserRequestGuard)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.children.logout(this.refreshCookie(request));
    response.clearCookie(this.config.cookieName, this.cookieOptions());
    response.setHeader('Cache-Control', 'no-store');
    return null;
  }

  @Get('me')
  @SkipThrottle()
  @ChildRoute()
  me(@CurrentChild() child: ChildPrincipal) {
    return child;
  }
}
