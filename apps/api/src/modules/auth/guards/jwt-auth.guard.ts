import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { z } from 'zod';
import authConfig from '../../../common/config/auth.config.js';
import type { AuthenticatedRequest } from '../../../common/security/principal.js';
import { UsersService } from '../../users/users.service.js';
import { PUBLIC_ROUTE } from '../decorators/auth.decorators.js';

const claimsSchema = z.object({
  sub: z.uuid(),
  tokenUse: z.literal('access'),
  iat: z.number().int(),
  exp: z.number().int(),
  jti: z.uuid(),
});

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly users: UsersService,
    @Inject(authConfig.KEY)
    private readonly config: ConfigType<typeof authConfig>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const match = /^Bearer ([^\s]+)$/i.exec(
      request.headers.authorization ?? '',
    );
    if (!match) throw new UnauthorizedException('Authentication is required.');
    let userId: string;
    try {
      const payload: unknown = await this.jwt.verifyAsync(match[1], {
        secret: this.config.secret,
        algorithms: ['HS256'],
        issuer: this.config.issuer,
        audience: this.config.audience,
        maxAge: `${this.config.accessTtlSeconds}s`,
      });
      const claims = claimsSchema.parse(payload);
      if (
        claims.exp <= claims.iat ||
        claims.exp - claims.iat > this.config.accessTtlSeconds ||
        claims.iat > Math.floor(Date.now() / 1000)
      )
        throw new Error('Invalid lifetime');
      userId = claims.sub;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token.');
    }
    // Read current status/roles/permissions, rather than trusting stale JWT claims.
    request.principal = await this.users.requireActivePrincipal(userId);
    return true;
  }
}
