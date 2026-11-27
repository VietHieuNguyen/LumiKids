import { UnauthorizedException } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import type authConfig from '../../common/config/auth.config.js';
import type { UsersService } from '../users/users.service.js';
import type { PasswordService } from './password.service.js';
import type { AuthSessionsRepository } from './auth-sessions.repository.js';
import type { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service.js';

const now = new Date('2026-11-27T03:00:00.000Z');

function setup(account: Record<string, unknown> | null, passwordOk: boolean) {
  const users = {
    findForLogin: vi.fn(() => Promise.resolve(account)),
    recordFailedLogin: vi.fn(() => Promise.resolve({ lockedUntil: null })),
    clearFailedLogins: vi.fn(() => Promise.resolve()),
    toPrincipal: vi.fn(() => ({ userId: 'u' })),
  };
  const passwords = { verify: vi.fn(() => Promise.resolve(passwordOk)) };
  const sessions = { create: vi.fn(() => Promise.resolve()) };
  const config = { refreshTtlSeconds: 3600, accessTtlSeconds: 900 };
  const service = new AuthService(
    users as unknown as UsersService,
    passwords as unknown as PasswordService,
    sessions as unknown as AuthSessionsRepository,
    { signAsync: vi.fn(() => Promise.resolve('token')) } as unknown as JwtService,
    config as unknown as ConfigType<typeof authConfig>,
  );
  vi.useFakeTimers({ now });
  return { service, users, sessions };
}

const active = { userId: 'u1', status: 'ACTIVE', passwordHash: 'h', failedLoginCount: 0, lockedUntil: null };

describe('AuthService.login lockout (FR-1.1 AC-02)', () => {
  afterEach(() => vi.useRealTimers());

  it('counts each wrong password and locks for 15 minutes at the fifth', async () => {
    const { service, users } = setup(active, false);
    await expect(service.login({ email: 'a@x.test', password: 'wrong' })).rejects.toThrow(UnauthorizedException);
    expect(users.recordFailedLogin).toHaveBeenCalledWith('u1', 5, 15 * 60 * 1000, now);
  });

  it('refuses the right password while locked, with the same answer as a wrong one', async () => {
    const locked = { ...active, lockedUntil: new Date(now.getTime() + 60_000) };
    const { service, users, sessions } = setup(locked, true);
    await expect(service.login({ email: 'a@x.test', password: 'right' })).rejects.toThrow('Invalid email or password.');
    expect(sessions.create).not.toHaveBeenCalled();
    expect(users.clearFailedLogins).not.toHaveBeenCalled();
  });

  it('clears the counter after a successful sign-in', async () => {
    const { service, users, sessions } = setup({ ...active, failedLoginCount: 3 }, true);
    await service.login({ email: 'a@x.test', password: 'right' });
    expect(users.clearFailedLogins).toHaveBeenCalledWith('u1');
    expect(sessions.create).toHaveBeenCalledOnce();
  });

  it('allows sign-in again once the lock has passed', async () => {
    const expired = { ...active, lockedUntil: new Date(now.getTime() - 1) };
    const { service, sessions } = setup(expired, true);
    await service.login({ email: 'a@x.test', password: 'right' });
    expect(sessions.create).toHaveBeenCalledOnce();
  });
});
