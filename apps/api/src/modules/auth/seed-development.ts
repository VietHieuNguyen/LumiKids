import { config } from 'dotenv';
import { apiEnvFiles } from '../../common/config/env-files.js';
import databaseConfig from '../../common/config/database.config.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PasswordService } from './password.service.js';
import type { PermissionCode, RoleCode } from '../../generated/prisma/enums.js';
import { childPermissions } from './child-permissions.js';

config({ path: apiEnvFiles(), quiet: true });

const accounts: {
  email: string;
  fullName: string;
  role: RoleCode;
  passwordKey: string;
}[] = [
  {
    email: 'admin@lumikids.local',
    fullName: 'Quản trị viên test',
    role: 'ROLE_ADMIN',
    passwordKey: 'SEED_ADMIN_PASSWORD',
  },
  {
    email: 'teacher1@lumikids.local',
    fullName: 'Giáo viên test 1',
    role: 'ROLE_TEACHER',
    passwordKey: 'SEED_TEACHER_PASSWORD',
  },
  {
    email: 'guardian1@lumikids.local',
    fullName: 'Người giám hộ test 1',
    role: 'ROLE_GUARDIAN',
    passwordKey: 'SEED_GUARDIAN_PASSWORD',
  },
  {
    email: 'child1@lumikids.local',
    fullName: 'Trẻ test 1',
    role: 'ROLE_CHILD',
    passwordKey: 'SEED_CHILD_PASSWORD',
  },
];
const grants: Record<RoleCode, PermissionCode[]> = {
  ROLE_ADMIN: [
    'READ_OWN_ACCOUNT',
    'MANAGE_USERS',
    'GENERATE_GAME_CONTENT',
    'READ_GAME_ASSETS',
    'MANAGE_GAME_ASSETS',
    'READ_GAMES',
    'SAVE_GAMES',
    'MANAGE_ALL_GAMES',
  ],
  ROLE_TEACHER: [
    'READ_OWN_ACCOUNT',
    'GENERATE_GAME_CONTENT',
    'READ_GAMES',
    'SAVE_GAMES',
  ],
  ROLE_GUARDIAN: ['READ_OWN_ACCOUNT'],
  ROLE_CHILD: [...childPermissions],
};

let prisma: PrismaService | undefined;
try {
  const database = databaseConfig();
  const target = new URL(database.url);
  if (
    process.env.NODE_ENV === 'production' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ||
    target.pathname !== '/lumikids_db'
  ) {
    throw new Error(
      'Development seed requires the local lumikids_db database.',
    );
  }
  const passwords = new PasswordService();
  const prepared = await Promise.all(
    accounts.map(async (account) => {
      const password = process.env[account.passwordKey];
      if (!password) throw new Error(`Missing ${account.passwordKey}.`);
      return { ...account, passwordHash: await passwords.hash(password) };
    }),
  );
  prisma = new PrismaService(database);
  await prisma.onModuleInit();
  const result = await prisma.$transaction(async (tx) => {
    const permissions = new Map<PermissionCode, string>();
    for (const code of new Set(Object.values(grants).flat())) {
      const permission = await tx.permission.upsert({
        where: { code },
        update: {},
        create: { code },
      });
      permissions.set(code, permission.permissionId);
    }
    const roles = new Map<RoleCode, string>();
    for (const code of Object.keys(grants) as RoleCode[]) {
      const role = await tx.role.upsert({
        where: { code },
        update: {},
        create: { code },
      });
      roles.set(code, role.roleId);
      for (const permissionCode of grants[code]) {
        const permissionId = permissions.get(permissionCode);
        if (!permissionId) throw new Error('Missing seeded permission.');
        const relation = { roleId: role.roleId, permissionId };
        await tx.rolePermission.upsert({
          where: { roleId_permissionId: relation },
          update: {},
          create: relation,
        });
      }
    }
    const summary: {
      email: string;
      role: RoleCode;
      permissions: PermissionCode[];
    }[] = [];
    for (const account of prepared) {
      const user = await tx.user.upsert({
        where: { email: account.email },
        update: { passwordHash: account.passwordHash, status: 'ACTIVE' },
        create: {
          email: account.email,
          fullName: account.fullName,
          phone: '',
          address: '',
          passwordHash: account.passwordHash,
          status: 'ACTIVE',
        },
      });
      const roleId = roles.get(account.role);
      if (!roleId) throw new Error('Missing seeded role.');
      const relation = { userId: user.userId, roleId };
      await tx.userRole.upsert({
        where: { userId_roleId: relation },
        update: {},
        create: relation,
      });
      await tx.authSession.updateMany({
        where: { userId: user.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      summary.push({
        email: user.email,
        role: account.role,
        permissions: grants[account.role],
      });
    }
    return summary;
  });
  console.log(JSON.stringify({ seeded: result }, null, 2));
} catch (error) {
  const missingPassword =
    error instanceof Error && /^Missing SEED_[A-Z_]+\.$/.test(error.message);
  console.error(
    missingPassword
      ? error.message
      : 'Development seed failed. Check the local database, migration status and seed password variables.',
  );
  process.exitCode = 1;
} finally {
  await prisma?.onModuleDestroy();
}
