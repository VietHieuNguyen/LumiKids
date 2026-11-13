import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Principal } from '../../common/security/principal.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { subject } from '@casl/ability';
import { buildAbility } from '../../common/security/ability.js';

const accountSelect = {
  userId: true,
  fullName: true,
  email: true,
  phone: true,
  address: true,
  status: true,
  roles: {
    select: {
      role: {
        select: {
          code: true,
          permissions: { select: { permission: { select: { code: true } } } },
        },
      },
    },
  },
} satisfies Prisma.UserSelect;

type Account = Prisma.UserGetPayload<{ select: typeof accountSelect }>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findForLogin(email: string) {
    return this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { ...accountSelect, passwordHash: true },
    });
  }

  async requireActivePrincipal(userId: string): Promise<Principal> {
    const account = await this.prisma.user.findUnique({
      where: { userId },
      select: accountSelect,
    });
    if (!account || account.status !== 'ACTIVE')
      throw new UnauthorizedException('Authentication is required.');
    return this.toPrincipal(account);
  }

  toPrincipal(account: Account): Principal {
    return {
      userId: account.userId,
      fullName: account.fullName,
      email: account.email,
      phone: account.phone,
      address: account.address,
      status: account.status,
      roles: account.roles.map(({ role }) => role.code),
      permissions: [
        ...new Set(
          account.roles.flatMap(({ role }) =>
            role.permissions.map(({ permission }) => permission.code),
          ),
        ),
      ],
    };
  }

  findChildByUserId(userId: string) {
    return this.prisma.child.findUnique({
      where: { userId },
      select: { childId: true, userId: true },
    });
  }

  async getOwnAccount(actor: Principal, userId: string): Promise<Principal> {
    // Permission checks do not replace this resource ownership check.
    if (
      !buildAbility(actor).can(
        'READ_OWN_ACCOUNT',
        subject('Account', { userId }),
      )
    )
      throw new ForbiddenException('You cannot access another account.');
    return this.requireActivePrincipal(userId);
  }
}
