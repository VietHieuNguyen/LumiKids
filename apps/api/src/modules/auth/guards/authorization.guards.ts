import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type {
  PermissionCode,
  RoleCode,
} from '../../../generated/prisma/enums.js';
import type { AuthenticatedRequest } from '../../../common/security/principal.js';
import {
  buildAbility,
  permissionSubject,
} from '../../../common/security/ability.js';
import {
  REQUIRED_PERMISSIONS,
  REQUIRED_ROLES,
} from '../decorators/auth.decorators.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<RoleCode[]>(REQUIRED_ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) return true;
    const user = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>().principal;
    if (!user) throw new UnauthorizedException('Authentication is required.');
    if (!roles.some((role) => user.roles.includes(role)))
      throw new ForbiddenException('Insufficient role.');
    return true;
  }
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const permissions = this.reflector.getAllAndOverride<PermissionCode[]>(
      REQUIRED_PERMISSIONS,
      [context.getHandler(), context.getClass()],
    );
    if (!permissions?.length) return true;
    const user = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>().principal;
    if (!user) throw new UnauthorizedException('Authentication is required.');
    const ability = buildAbility(user);
    if (
      !permissions.every((permission) => {
        const target = permissionSubject(permission);
        return target !== undefined && ability.can(permission, target);
      })
    )
      throw new ForbiddenException('Insufficient permission.');
    return true;
  }
}
