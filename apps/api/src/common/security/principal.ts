import type { Request } from 'express';
import type {
  AccountStatus,
  PermissionCode,
  RoleCode,
} from '../../generated/prisma/enums.js';

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

export interface AuthenticatedRequest extends Request {
  principal?: Principal;
}
