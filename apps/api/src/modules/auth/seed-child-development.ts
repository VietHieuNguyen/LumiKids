import { config } from 'dotenv';
import { apiEnvFiles } from '../../common/config/env-files.js';
import databaseConfig from '../../common/config/database.config.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PasswordService } from './password.service.js';
import { childPermissions } from './child-permissions.js';

config({ path: apiEnvFiles(), quiet: true });

// Targeted seed: does not run the full development seed or touch adult accounts.
const email = 'child1@lumikids.local';
let prisma: PrismaService | undefined;
try {
  const database = databaseConfig();
  const target = new URL(database.url);
  if (
    process.env.NODE_ENV === 'production' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ||
    target.pathname !== '/lumikids_db'
  )
    throw new Error('Local development database required.');
  const password = process.env.SEED_CHILD_PASSWORD;
  if (!password || password.length < 8 || password.length > 128)
    throw new Error('SEED_CHILD_PASSWORD must contain 8–128 characters.');
  // Child profile data must be real; both variables omitted means "no profile yet".
  const dobInput = process.env.SEED_CHILD_DOB;
  const genderInput = process.env.SEED_CHILD_GENDER;
  let profile: { dob: Date; gender: 'MALE' | 'FEMALE' } | undefined;
  if (dobInput || genderInput) {
    const dob = new Date(`${dobInput ?? ''}T00:00:00.000Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(dobInput ?? '') ||
      Number.isNaN(dob.getTime()) ||
      dob > new Date()
    )
      throw new Error('SEED_CHILD_DOB must be a past date YYYY-MM-DD.');
    if (genderInput !== 'MALE' && genderInput !== 'FEMALE')
      throw new Error('SEED_CHILD_GENDER must be MALE or FEMALE.');
    profile = { dob, gender: genderInput };
  }
  const passwords = new PasswordService();
  const passwordHash = await passwords.hash(password);
  prisma = new PrismaService(database);
  await prisma.onModuleInit();
  const result = await prisma.$transaction(async (tx) => {
    const role = await tx.role.findUnique({
      where: { code: 'ROLE_CHILD' },
      include: { permissions: { include: { permission: true } } },
    });
    if (
      !role ||
      role.permissions.length !== childPermissions.length ||
      childPermissions.some(
        (code) =>
          !role.permissions.some((grant) => grant.permission.code === code),
      )
    )
      throw new Error('Child role migration must be applied first.');
    const existing = await tx.user.findUnique({
      where: { email },
      include: { roles: { include: { role: true } } },
    });
    if (
      existing &&
      (existing.roles.length !== 1 ||
        existing.roles[0].role.code !== 'ROLE_CHILD')
    )
      throw new Error('Refusing to replace a non-child account.');
    const unchanged =
      existing?.status === 'ACTIVE' &&
      (await passwords.verify(password, existing.passwordHash));
    const account = existing
      ? unchanged
        ? existing
        : await tx.user.update({
            where: { userId: existing.userId },
            data: { passwordHash, status: 'ACTIVE' },
          })
      : await tx.user.create({
          data: {
            email,
            fullName: 'Trẻ test 1',
            phone: '',
            address: '',
            passwordHash,
            status: 'ACTIVE',
            roles: { create: { roleId: role.roleId } },
          },
        });
    if (existing && !unchanged)
      await tx.authSession.updateMany({
        where: { userId: existing.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    const child = profile
      ? await tx.child.upsert({
          where: { userId: account.userId },
          create: { userId: account.userId, fullName: account.fullName, ...profile },
          update: profile,
          select: { childId: true },
        })
      : await tx.child.findUnique({
          where: { userId: account.userId },
          select: { childId: true },
        });
    return {
      email: account.email,
      role: 'ROLE_CHILD',
      status: account.status,
      permissions: childPermissions,
      created: !existing,
      childProfile: Boolean(child),
    };
  });
  console.log(JSON.stringify({ seeded: result }, null, 2));
} catch {
  console.error(
    'Child development seed failed. Check local DB, child migration, SEED_CHILD_PASSWORD and any existing account with the same email.',
  );
  process.exitCode = 1;
} finally {
  await prisma?.onModuleDestroy();
}
