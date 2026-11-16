import type { Request } from 'express';
import type {
  AccountStatus,
  PermissionCode,
  RoleCode,
} from '../../generated/prisma/enums.js';

/** An adult account (Admin, Teacher, Guardian) signed in with email and password. */
export interface Principal {
  userId: string;
  fullName: string;
  email: string;
  phone: string;
  address: string;
  status: AccountStatus;
  roles: RoleCode[];
  permissions: PermissionCode[];
}

/** A child signed in with a personal login code. A child is not a User. */
export interface ChildPrincipal {
  childId: string;
  fullName: string;
  permissions: PermissionCode[];
}

/** Whoever is acting: only what CASL needs to build an ability. */
export type AbilityActor =
  | Pick<Principal, 'userId' | 'permissions'>
  | Pick<ChildPrincipal, 'childId' | 'permissions'>;

export interface AuthenticatedRequest extends Request {
  principal?: Principal;
  child?: ChildPrincipal;
}
