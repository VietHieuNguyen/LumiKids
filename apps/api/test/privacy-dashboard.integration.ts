import { randomUUID } from 'node:crypto';
import { AdminOverviewRepository } from '../src/modules/admin-overview/admin-overview.repository.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const testUrl = process.env.TEST_DATABASE_URL;

// FR-1.7 AC-02: the school dashboard SQL runs on real PostgreSQL and leaves out family-only children.
describe.skipIf(!testUrl)('Admin dashboard privacy filter (explicit test DB only)', () => {
  let prisma: PrismaService;
  let repository: AdminOverviewRepository;
  const cleanups: (() => Promise<unknown>)[] = [];

  beforeAll(async () => {
    if (!testUrl) throw new Error('TEST_DATABASE_URL is required.');
    const url = new URL(testUrl);
    const database = decodeURIComponent(url.pathname.slice(1));
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !database.endsWith('_test') || database === 'lumikids_db')
      throw new Error('Integration tests require a local dedicated database whose name ends in _test.');
    prisma = new PrismaService({ url: testUrl });
    repository = new AdminOverviewRepository(prisma);
    await prisma.onModuleInit();
  });
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  });
  afterAll(async () => {
    await prisma?.onModuleDestroy();
  });

  it('runs the dashboard queries and does not count family-only children as unassigned school children', async () => {
    const before = await repository.unassignedChildren();
    const family = await prisma.child.create({
      data: { fullName: 'Bé Nhà', dob: new Date('2021-01-01'), gender: 'MALE', origin: 'FAMILY' },
    });
    const school = await prisma.child.create({
      data: { fullName: 'Bé Trường', dob: new Date('2021-02-01'), gender: 'FEMALE', origin: 'SCHOOL' },
    });
    cleanups.push(async () => {
      await prisma.child.deleteMany({ where: { childId: { in: [family.childId, school.childId] } } });
    });

    expect(await repository.unassignedChildren()).toBe(before + 1);
    const from = '2000-01-01';
    const active = await repository.activeChildren(from, 'Asia/Ho_Chi_Minh');
    const daily = await repository.daily(from, 'Asia/Ho_Chi_Minh');
    expect(typeof active.total).toBe('number');
    expect(Array.isArray(daily)).toBe(true);
    expect(Array.isArray(active.perClass)).toBe(true);
  });
});
