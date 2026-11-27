import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import authConfig from '../../common/config/auth.config.js';
import { UsersService } from '../users/users.service.js';
import { PasswordService } from './password.service.js';
import { AuthSessionsRepository } from './auth-sessions.repository.js';
import {
  newRefreshToken,
  parseRefreshToken,
  verifierMatches,
} from './refresh-token.js';
import type { Principal } from '../../common/security/principal.js';
import type { LoginDto } from './dto/login.dto.js';
import { ApiProblem } from '../../common/http/api-problem.js';

/** FR-1.1 AC-02: five wrong passwords lock sign-in for 15 minutes. */
const LOGIN_FAILURE_LIMIT = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly sessions: AuthSessionsRepository,
    private readonly jwt: JwtService,
    @Inject(authConfig.KEY)
    private readonly config: ConfigType<typeof authConfig>,
  ) {}

  private accessToken(userId: string): Promise<string> {
    return this.jwt.signAsync(
      { tokenUse: 'access' },
      {
        secret: this.config.secret,
        algorithm: 'HS256',
        subject: userId,
        issuer: this.config.issuer,
        audience: this.config.audience,
        expiresIn: this.config.accessTtlSeconds,
        jwtid: randomUUID(),
      },
    );
  }

  private async result(user: Principal, refresh: string, expiresAt: Date) {
    return {
      accessToken: await this.accessToken(user.userId),
      tokenType: 'Bearer' as const,
      expiresIn: this.config.accessTtlSeconds,
      user,
      refresh,
      refreshExpiresAt: expiresAt,
    };
  }

  async login(dto: LoginDto) {
    const account = await this.users.findForLogin(dto.email);
    const now = new Date();
    // Still hashed while locked, so a locked account answers as slowly as any other.
    const valid = await this.passwords.verify(
      dto.password,
      account?.passwordHash,
    );
    if (account?.lockedUntil && account.lockedUntil > now)
      throw new UnauthorizedException('Invalid email or password.');
    if (!account || !valid) {
      if (account) await this.users.recordFailedLogin(account.userId, LOGIN_FAILURE_LIMIT, LOGIN_LOCK_MS, now);
      throw new UnauthorizedException('Invalid email or password.');
    }
    if (account.failedLoginCount > 0 || account.lockedUntil)
      await this.users.clearFailedLogins(account.userId);
    // Only someone who knows the password learns that the email still needs verifying.
    if (account.status === 'PENDING_VERIFICATION')
      throw new ApiProblem('ACCOUNT_NOT_VERIFIED');
    if (account.status !== 'ACTIVE')
      throw new UnauthorizedException('Invalid email or password.');
    const refresh = newRefreshToken();
    const expiresAt = new Date(
      Date.now() + this.config.refreshTtlSeconds * 1000,
    );
    await this.sessions.create(account.userId, refresh, expiresAt);
    return this.result(
      this.users.toPrincipal(account),
      refresh.value,
      expiresAt,
    );
  }

  async refresh(value: unknown) {
    const input = parseRefreshToken(value);
    if (!input) throw new UnauthorizedException('Invalid refresh token.');
    const token = await this.sessions.find(input.tokenId);
    if (!token || !verifierMatches(input.value, token.verifier))
      throw new UnauthorizedException('Invalid refresh token.');
    const user = await this.users.requireActivePrincipal(token.session.userId);
    const replacement = newRefreshToken();
    const result = await this.sessions.rotate(
      input.tokenId,
      input.value,
      replacement,
    );
    if (result !== 'rotated')
      throw new UnauthorizedException('Invalid refresh token.');
    return this.result(user, replacement.value, token.session.expiresAt);
  }

  async logout(value: unknown): Promise<void> {
    const input = parseRefreshToken(value);
    if (input) await this.sessions.revoke(input.tokenId, input.value);
  }
}
