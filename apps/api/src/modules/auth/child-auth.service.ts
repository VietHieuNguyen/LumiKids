import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import authConfig from '../../common/config/auth.config.js';
import childAuthConfig from '../../common/config/child-auth.config.js';
import type { ChildPrincipal } from '../../common/security/principal.js';
import { childPrincipalPermissions } from './child-permissions.js';
import { ChildAuthRepository } from './child-auth.repository.js';
import { AuditService } from '../audit/audit.service.js';
import { ApiProblem } from '../../common/http/api-problem.js';
import type { ChildAccount } from './child-auth.repository.js';
import {
  generateLoginCode,
  loginCodeDigest,
  normalizeLoginCode,
} from './child-login-code.js';
import {
  newRefreshToken,
  parseRefreshToken,
  verifierMatches,
} from './refresh-token.js';

/** Marks a child access token; the guard refuses it on adult routes and vice versa. */
export const CHILD_TOKEN_USE = 'child_access';

const INVALID_CODE = 'Mã đăng nhập không đúng.';

export function toChildPrincipal(child: ChildAccount): ChildPrincipal {
  return {
    childId: child.childId,
    fullName: child.fullName,
    permissions: [...childPrincipalPermissions],
  };
}

@Injectable()
export class ChildAuthService {
  constructor(
    private readonly children: ChildAuthRepository,
    private readonly jwt: JwtService,
    @Inject(authConfig.KEY)
    private readonly auth: ConfigType<typeof authConfig>,
    @Inject(childAuthConfig.KEY)
    private readonly config: ConfigType<typeof childAuthConfig>,
    private readonly audit: AuditService,
  ) {}

  private accessToken(childId: string): Promise<string> {
    return this.jwt.signAsync(
      { tokenUse: CHILD_TOKEN_USE },
      {
        secret: this.auth.secret,
        algorithm: 'HS256',
        subject: childId,
        issuer: this.auth.issuer,
        audience: this.auth.audience,
        expiresIn: this.auth.accessTtlSeconds,
        jwtid: randomUUID(),
      },
    );
  }

  private async result(
    child: ChildPrincipal,
    refresh: string,
    expiresAt: Date,
  ) {
    return {
      accessToken: await this.accessToken(child.childId),
      tokenType: 'Bearer' as const,
      expiresIn: this.auth.accessTtlSeconds,
      child,
      refresh,
      refreshExpiresAt: expiresAt,
    };
  }

  /** The same answer for an unknown code, a disabled child or one without a class: nothing to enumerate. */
  private async requireSignInAllowed(
    child: ChildAccount | null,
  ): Promise<ChildAccount> {
    if (
      !child ||
      child.status !== 'ACTIVE' ||
      !(await this.children.hasCurrentClass(child.childId))
    )
      throw new UnauthorizedException(INVALID_CODE);
    if (await this.children.activeLoginLock(child.childId)) throw new ApiProblem('CHILD_LOGIN_LOCKED');
    return child;
  }

  async login(code: unknown) {
    const normalized = normalizeLoginCode(code);
    if (!normalized) throw new UnauthorizedException(INVALID_CODE);
    const child = await this.requireSignInAllowed(
      await this.children.findByCodeDigest(
        loginCodeDigest(normalized, this.config.codeSecret),
      ),
    );
    const refresh = newRefreshToken();
    const expiresAt = new Date(
      Date.now() + this.config.refreshTtlSeconds * 1000,
    );
    await this.children.createSession(child.childId, refresh, expiresAt);
    return this.result(toChildPrincipal(child), refresh.value, expiresAt);
  }

  async refresh(value: unknown) {
    const input = parseRefreshToken(value);
    if (!input) throw new UnauthorizedException('Invalid refresh token.');
    const token = await this.children.findToken(input.tokenId);
    if (!token || !verifierMatches(input.value, token.verifier))
      throw new UnauthorizedException('Invalid refresh token.');
    // A child moved out of every class, or disabled, loses the session at the next refresh.
    const child = await this.requireSignInAllowed(
      await this.children.findById(token.session.childId),
    ).catch(() => {
      throw new UnauthorizedException('Invalid refresh token.');
    });
    const replacement = newRefreshToken();
    const rotated = await this.children.rotate(
      input.tokenId,
      input.value,
      replacement,
    );
    if (rotated !== 'rotated')
      throw new UnauthorizedException('Invalid refresh token.');
    return this.result(
      toChildPrincipal(child),
      replacement.value,
      token.session.expiresAt,
    );
  }

  async logout(value: unknown): Promise<void> {
    const input = parseRefreshToken(value);
    if (input) await this.children.revoke(input.tokenId, input.value);
  }

  /**
   * Issues a new code for a child (callers check who may do this). The code is returned once and only its
   * digest is kept. A collision with another child's code is astronomically rare; retry a few times anyway.
   */
  async issueLoginCode(
    childId: string,
  ): Promise<{ code: string; issuedAt: Date }> {
    const issued = await this.generateAndStoreCode(async (digest, issuedAt) =>
      await this.children.replaceLoginCode(childId, digest, issuedAt) ? 'SAVED' : 'COLLISION',
    );
    if (!issued) throw new Error('Could not issue a login code.');
    return issued;
  }

  issueFirstCodeInClass(childId: string, classId: string, teacherId: string) {
    return this.generateAndStoreCode((digest, issuedAt) =>
      this.children.insertFirstClassCode(childId, classId, teacherId, digest, issuedAt),
    );
  }

  private async generateAndStoreCode(
    persist: (digest: string, issuedAt: Date) => Promise<'SAVED' | 'NOT_ELIGIBLE' | 'COLLISION'>,
  ): Promise<{ code: string; issuedAt: Date } | null> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const code = generateLoginCode();
      const normalized = normalizeLoginCode(code);
      if (!normalized) continue;
      const issuedAt = new Date();
      const status = await persist(loginCodeDigest(normalized, this.config.codeSecret), issuedAt);
      if (status === 'SAVED') return { code, issuedAt };
      if (status === 'NOT_ELIGIBLE') return null;
    }
    throw new Error('Could not issue a unique login code.');
  }

  /** Per-request check behind a child access token: current status, not stale token claims. */
  async requireActiveChild(childId: string): Promise<ChildPrincipal> {
    const child = await this.children.findById(childId);
    if (!child || child.status !== 'ACTIVE' || (await this.children.activeLoginLock(childId)))
      throw new UnauthorizedException('Authentication is required.');
    return toChildPrincipal(child);
  }

  /** Admin locks a child's sign-in while the child is in a class; the child is signed out everywhere. */
  async lockLogin(actorId: string, childId: string, reason: string, now = new Date()): Promise<void> {
    if (!(await this.children.hasCurrentEnrollment(childId))) throw new ApiProblem('CHILD_NOT_ENROLLED');
    if (await this.children.activeLoginLock(childId)) throw new ApiProblem('CHILD_LOGIN_ALREADY_LOCKED');
    const lockId = await this.children.createLoginLock(childId, reason, actorId, now);
    await this.audit.record({ actorUserId: actorId, action: 'CHILD_LOGIN_LOCKED', targetType: 'Child', targetId: childId, detail: { lockId } });
  }

  async unlockLogin(actorId: string, childId: string, now = new Date()): Promise<void> {
    if (!(await this.children.unlockLoginLock(childId, actorId, now))) throw new ApiProblem('CHILD_LOGIN_NOT_LOCKED');
    await this.audit.record({ actorUserId: actorId, action: 'CHILD_LOGIN_UNLOCKED', targetType: 'Child', targetId: childId, detail: {} });
  }

  async currentLoginLock(childId: string) {
    const row = await this.children.currentLoginLock(childId);
    return {
      childId,
      loginLocked: row !== null,
      reason: row?.reason ?? null,
      lockedAt: row?.lockedAt.toISOString() ?? null,
    };
  }

  async locksForClass(classId: string) {
    const rows = await this.children.locksForClass(classId);
    return rows.map((row) => ({
      lockId: row.lockId,
      childId: row.childId,
      childName: row.child.fullName,
      reason: row.reason,
      lockedAt: row.lockedAt.toISOString(),
      lockedByName: row.lockedBy.fullName,
    }));
  }
}
