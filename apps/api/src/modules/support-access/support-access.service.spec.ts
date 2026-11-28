import { randomUUID } from 'node:crypto';
import type { Principal } from '../../common/security/principal.js';
import type { AuditService } from '../audit/audit.service.js';
import type { SupportAccessRepository } from './support-access.repository.js';
import { SupportAccessService } from './support-access.service.js';

const now = new Date('2026-11-29T02:00:00.000Z');
const guardian: Principal = {
  userId: randomUUID(),
  fullName: 'Phụ huynh',
  email: 'p@example.test',
  phone: '',
  address: '',
  status: 'ACTIVE',
  roles: ['ROLE_GUARDIAN'],
  permissions: ['MANAGE_FAMILY'],
} as unknown as Principal;
const staff = { ...guardian, userId: randomUUID(), roles: ['ROLE_ADMIN'], permissions: ['MANAGE_CLASSROOMS'] } as unknown as Principal;

function setup(options: { owned?: boolean; devMode?: boolean; grant?: { expiresAt: Date; revokedAt: Date | null } | null }) {
  const childId = randomUUID();
  const grantId = randomUUID();
  const repository = {
    guardianOwnsChild: vi.fn(() => Promise.resolve(options.owned === false ? null : { childId })),
    createGrant: vi.fn((cid: string, gid: string, expiresAt: Date) =>
      Promise.resolve({ grantId, childId: cid, grantedAt: now, expiresAt, revokedAt: null, guardianId: gid }),
    ),
    findGrant: vi.fn(() =>
      Promise.resolve({ grantId, childId, grantedAt: now, expiresAt: options.grant?.expiresAt ?? new Date(now.getTime() + 3600_000), revokedAt: options.grant?.revokedAt ?? null }),
    ),
    revokeGrant: vi.fn(() => Promise.resolve(true)),
    activeGrant: vi.fn(() =>
      Promise.resolve(options.grant === null || options.grant === undefined ? null : { grantId, childId, grantedAt: now, expiresAt: options.grant.expiresAt, revokedAt: options.grant.revokedAt }),
    ),
    child: vi.fn(() => Promise.resolve({ childId, fullName: 'Bé An', dob: new Date('2021-05-01T00:00:00.000Z'), gender: 'FEMALE', status: 'ACTIVE' })),
    sessions: vi.fn(() => Promise.resolve([{ sessionId: randomUUID(), startedAt: now, endedAt: null, status: 'IN_PROGRESS', context: 'HOME', eventCount: 3 }])),
  };
  const audit = { record: vi.fn(() => Promise.resolve()) };
  const service = new SupportAccessService(repository as unknown as SupportAccessRepository, audit as unknown as AuditService, { devMode: options.devMode ?? false } as never);
  return { service, repository, audit, childId, grantId };
}

describe('SupportAccessService (privacy)', () => {
  it('grants support for the requested hours and audits the grant', async () => {
    const { service, audit, childId } = setup({});
    const granted = await service.grant(guardian, childId, { hours: 24 }, now);
    expect(granted.expiresAt).toBe(new Date(now.getTime() + 24 * 3600_000).toISOString());
    expect(granted.active).toBe(true);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'SUPPORT_GRANT_CREATED', actorUserId: guardian.userId }));
  });

  it('refuses a guardian who is not linked to the child', async () => {
    const { service, childId } = setup({ owned: false });
    await expect(service.grant(guardian, childId, { hours: 1 }, now)).rejects.toMatchObject({ publicCode: 'FAMILY_CHILD_NOT_FOUND' });
  });

  it('gives staff nothing without a running grant, and records no view', async () => {
    const { service, audit, childId } = setup({ grant: null });
    await expect(service.viewForStaff(staff, childId, now)).rejects.toMatchObject({ publicCode: 'SUPPORT_ACCESS_REQUIRED' });
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('shows staff the child and recent sessions while a grant runs, and audits each view', async () => {
    const { service, audit, childId, grantId } = setup({ grant: { expiresAt: new Date(now.getTime() + 3600_000), revokedAt: null } });
    const view = await service.viewForStaff(staff, childId, now);
    expect(view.child.fullName).toBe('Bé An');
    expect(view.sessions[0]?.context).toBe('HOME');
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'SUPPORT_DATA_VIEWED', detail: { grantId, devMode: false } }));
  });

  it('treats an expired or revoked grant as closed', async () => {
    const expired = setup({ grant: null });
    await expect(expired.service.viewForStaff(staff, expired.childId, now)).rejects.toMatchObject({ publicCode: 'SUPPORT_ACCESS_REQUIRED' });
  });

  it('revokes a running grant and audits it; a grant that already ended is reported as inactive', async () => {
    const { service, audit, repository, childId, grantId } = setup({ grant: { expiresAt: new Date(now.getTime() + 3600_000), revokedAt: now } });
    const revoked = await service.revoke(guardian, childId, grantId, now);
    expect(repository.revokeGrant).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'SUPPORT_GRANT_REVOKED' }));
    expect(revoked.active).toBe(false);
  });

  it('lists running grants for staff with names, and audits the list', async () => {
    const { service, audit, repository, childId, grantId } = setup({ grant: { expiresAt: new Date(now.getTime() + 3600_000), revokedAt: null } });
    (repository as unknown as { activeGrants: ReturnType<typeof vi.fn> }).activeGrants = vi.fn(() =>
      Promise.resolve([{ grantId, childId, expiresAt: new Date(now.getTime() + 3600_000), child: { fullName: 'Bé An' } }]),
    );
    const list = await service.listActiveForStaff(staff, now);
    expect(list).toEqual([{ grantId, childId, childName: 'Bé An', expiresAt: new Date(now.getTime() + 3600_000).toISOString() }]);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'SUPPORT_GRANTS_LISTED', actorUserId: staff.userId }));
  });

  it('dev mode shows the child without a grant, and still audits the view', async () => {
    const { service, audit, childId } = setup({ grant: null, devMode: true });
    const view = await service.viewForStaff(staff, childId, now);
    expect(view.grant).toBeNull();
    expect(view.child.fullName).toBe('Bé An');
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'SUPPORT_DATA_VIEWED', detail: { grantId: null, devMode: true } }));
  });
});
