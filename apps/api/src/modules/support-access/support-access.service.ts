import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import appConfig from '../../common/config/app.config.js';
import type { ActiveSupportGrant, CreateSupportGrantInput, SupportChildView, SupportGrant } from '@lumikids/shared';
import { ApiProblem } from '../../common/http/api-problem.js';
import type { Principal } from '../../common/security/principal.js';
import { AuditService } from '../audit/audit.service.js';
import { SupportAccessRepository } from './support-access.repository.js';

type GrantRow = { grantId: string; childId: string; grantedAt: Date; expiresAt: Date; revokedAt: Date | null };

const HOUR_MS = 60 * 60 * 1000;

function view(row: GrantRow, now: Date): SupportGrant {
  return {
    grantId: row.grantId,
    childId: row.childId,
    grantedAt: row.grantedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
    active: row.revokedAt === null && row.expiresAt > now,
  };
}

/**
 * Support access (privacy, FR-1.7 AC-02). A guardian grants it for a fixed time; each support view is recorded
 * in the audit log. Expiry and revocation are checked on every read, so nothing stays open by accident.
 */
@Injectable()
export class SupportAccessService {
  constructor(
    private readonly repository: SupportAccessRepository,
    private readonly audit: AuditService,
    @Inject(appConfig.KEY) private readonly config: ConfigType<typeof appConfig>,
  ) {}

  private async requireGuardianChild(guardian: Principal, childId: string) {
    if (!(await this.repository.guardianOwnsChild(guardian.userId, childId)))
      throw new ApiProblem('FAMILY_CHILD_NOT_FOUND');
  }

  async grant(guardian: Principal, childId: string, input: CreateSupportGrantInput, now = new Date()) {
    await this.requireGuardianChild(guardian, childId);
    const expiresAt = new Date(now.getTime() + input.hours * HOUR_MS);
    const row = await this.repository.createGrant(childId, guardian.userId, expiresAt);
    await this.audit.record({
      actorUserId: guardian.userId,
      action: 'SUPPORT_GRANT_CREATED',
      targetType: 'Child',
      targetId: childId,
      detail: { grantId: row.grantId, hours: input.hours },
    });
    return view(row, now);
  }

  async list(guardian: Principal, childId: string, now = new Date()): Promise<SupportGrant[]> {
    await this.requireGuardianChild(guardian, childId);
    return (await this.repository.listGrants(guardian.userId, childId)).map((row) => view(row, now));
  }

  async revoke(guardian: Principal, childId: string, grantId: string, now = new Date()): Promise<SupportGrant> {
    await this.requireGuardianChild(guardian, childId);
    const existing = await this.repository.findGrant(grantId, guardian.userId, childId);
    if (!existing) throw new ApiProblem('SUPPORT_GRANT_NOT_FOUND');
    if (await this.repository.revokeGrant(grantId, guardian.userId, childId, now)) {
      await this.audit.record({
        actorUserId: guardian.userId,
        action: 'SUPPORT_GRANT_REVOKED',
        targetType: 'Child',
        targetId: childId,
        detail: { grantId },
      });
    }
    const row = await this.repository.findGrant(grantId, guardian.userId, childId);
    if (!row) throw new NotFoundException();
    return view(row, now);
  }

  /** Staff list of running grants. Names are personal data, so the list itself is audited. */
  async listActiveForStaff(staff: Principal, now = new Date()): Promise<ActiveSupportGrant[]> {
    const rows = await this.repository.activeGrants(now);
    await this.audit.record({
      actorUserId: staff.userId,
      action: 'SUPPORT_GRANTS_LISTED',
      targetType: 'SupportGrant',
      targetId: 'active',
      detail: { count: rows.length },
    });
    return rows.map((row) => ({
      grantId: row.grantId,
      childId: row.childId,
      childName: row.child.fullName,
      expiresAt: row.expiresAt.toISOString(),
    }));
  }

  /** School staff read a home child only while a grant runs; every read is audited. */
  async viewForStaff(staff: Principal, childId: string, now = new Date()): Promise<SupportChildView> {
    const grant = await this.repository.activeGrant(childId, now);
    // Dev mode (local only, see app.config) shows the child without a grant; the view is still audited.
    if (!grant && !this.config.devMode) throw new ApiProblem('SUPPORT_ACCESS_REQUIRED');
    const child = await this.repository.child(childId);
    if (!child) throw new NotFoundException();
    await this.audit.record({
      actorUserId: staff.userId,
      action: 'SUPPORT_DATA_VIEWED',
      targetType: 'Child',
      targetId: childId,
      detail: { grantId: grant?.grantId ?? null, devMode: this.config.devMode },
    });
    const sessions = await this.repository.sessions(childId);
    return {
      child: {
        childId: child.childId,
        fullName: child.fullName,
        dob: child.dob.toISOString().slice(0, 10),
        gender: child.gender,
        status: child.status,
      },
      grant: grant ? { grantId: grant.grantId, expiresAt: grant.expiresAt.toISOString() } : null,
      sessions: sessions.map((session) => ({
        sessionId: session.sessionId,
        startedAt: session.startedAt.toISOString(),
        endedAt: session.endedAt?.toISOString() ?? null,
        status: session.status,
        context: session.context,
        eventCount: session.eventCount,
      })),
    };
  }
}
