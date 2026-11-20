import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { AccountStatusRepository } from './account-status.repository.js';

function setup(rows: { userId: string; status: string }[]) {
  const tx = {
    user: {
      findMany: vi.fn(() => Promise.resolve(rows)),
      updateMany: vi.fn(() => Promise.resolve({ count: 0 })),
    },
    authSession: { updateMany: vi.fn(() => Promise.resolve({ count: 0 })) },
  };
  const prisma = {
    $transaction: vi.fn((work: (client: typeof tx) => Promise<unknown>) =>
      work(tx),
    ),
  };
  return {
    repository: new AccountStatusRepository(prisma as unknown as PrismaService),
    tx,
  };
}

describe('AccountStatusRepository.setMany', () => {
  it('deactivates the eligible accounts, revokes their sessions and reports the rest', async () => {
    const [active, pending, disabled, missing] = [
      randomUUID(),
      randomUUID(),
      randomUUID(),
      randomUUID(),
    ];
    const { repository, tx } = setup([
      { userId: active, status: 'ACTIVE' },
      { userId: pending, status: 'PENDING_VERIFICATION' },
      { userId: disabled, status: 'DISABLED' },
    ]);
    const result = await repository.setMany(
      'ROLE_GUARDIAN',
      [active, pending, disabled, missing],
      'DISABLED',
    );
    expect(result).toEqual({
      updated: [active],
      skipped: [
        { userId: pending, reason: 'PENDING_VERIFICATION' },
        { userId: disabled, reason: 'UNCHANGED' },
        { userId: missing, reason: 'NOT_FOUND' },
      ],
    });
    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: {
        userId: { in: [active] },
        status: { not: 'PENDING_VERIFICATION' },
      },
      data: { status: 'DISABLED' },
    });
    expect(tx.authSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: { in: [active] }, revokedAt: null },
      }),
    );
  });

  it('reactivates without touching sessions, and writes nothing when nothing changes', async () => {
    const id = randomUUID();
    const reactivate = setup([{ userId: id, status: 'DISABLED' }]);
    expect(
      (await reactivate.repository.setMany('ROLE_TEACHER', [id], 'ACTIVE'))
        .updated,
    ).toEqual([id]);
    expect(reactivate.tx.authSession.updateMany).not.toHaveBeenCalled();
    const unchanged = setup([{ userId: id, status: 'ACTIVE' }]);
    await unchanged.repository.setMany('ROLE_TEACHER', [id], 'ACTIVE');
    expect(unchanged.tx.user.updateMany).not.toHaveBeenCalled();
  });
});
