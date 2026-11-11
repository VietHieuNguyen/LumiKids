import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import type { Request } from 'express';
import authConfig from '../../../common/config/auth.config.js';

@Injectable()
export class BrowserRequestGuard implements CanActivate {
  constructor(
    @Inject(authConfig.KEY)
    private readonly config: ConfigType<typeof authConfig>,
  ) {}
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    // A cross-site form cannot set this header; cross-site JS must pass CORS preflight.
    if (
      request.get('X-CSRF-Protection') !== '1' ||
      (request.headers.origin &&
        !this.config.origins.includes(request.headers.origin))
    ) {
      throw new ForbiddenException(
        'Request origin or CSRF protection header is invalid.',
      );
    }
    return true;
  }
}
