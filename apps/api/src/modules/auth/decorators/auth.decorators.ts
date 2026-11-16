import {
  createParamDecorator,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type {
  PermissionCode,
  RoleCode,
} from '../../../generated/prisma/enums.js';
import type { AuthenticatedRequest } from '../../../common/security/principal.js';

export const PUBLIC_ROUTE = 'auth:public';
export const CHILD_ROUTE = 'auth:child';
export const REQUIRED_ROLES = 'auth:roles';
export const REQUIRED_PERMISSIONS = 'auth:permissions';
export const Public = () => SetMetadata(PUBLIC_ROUTE, true);
/** The route is for children signed in with a login code; adult tokens are refused there, and vice versa. */
export const ChildRoute = () => SetMetadata(CHILD_ROUTE, true);
export const Roles = (...roles: RoleCode[]) =>
  SetMetadata(REQUIRED_ROLES, roles);
export const Permissions = (...permissions: PermissionCode[]) =>
  SetMetadata(REQUIRED_PERMISSIONS, permissions);
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const principal = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>().principal;
    if (!principal)
      throw new UnauthorizedException('Authentication is required.');
    return principal;
  },
);
export const CurrentChild = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const child = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>().child;
    if (!child) throw new UnauthorizedException('Authentication is required.');
    return child;
  },
);
