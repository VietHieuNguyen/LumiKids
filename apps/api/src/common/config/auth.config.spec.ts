import { randomBytes } from 'node:crypto';
import authConfig from './auth.config.js';

describe('auth configuration security', () => {
  beforeEach(() => {
    vi.stubEnv('JWT_ACCESS_SECRET', randomBytes(48).toString('base64url'));
    vi.stubEnv('AUTH_ALLOWED_ORIGINS', 'http://localhost:3000');
    vi.stubEnv('AUTH_COOKIE_SECURE', 'false');
    vi.stubEnv('AUTH_COOKIE_SAME_SITE', 'lax');
    vi.stubEnv('NODE_ENV', 'development');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('uses short access tokens and HttpOnly-cookie compatible defaults', () => {
    const config = authConfig();
    expect(config.accessTtlSeconds).toBe(900);
    expect(config.refreshTtlSeconds).toBe(604800);
    expect(config.cookieSameSite).toBe('lax');
    expect(config.origins).toEqual(['http://localhost:3000']);
  });
  it.each([
    ['JWT_ACCESS_SECRET', 'short'],
    ['AUTH_ALLOWED_ORIGINS', '*'],
    ['AUTH_ALLOWED_ORIGINS', 'https://example.test/path'],
    ['AUTH_COOKIE_SAME_SITE', 'none'],
    ['NODE_ENV', 'production'],
  ])('rejects insecure settings without echoing inputs (%s)', (key, value) => {
    vi.stubEnv(key, value);
    expect(() => authConfig()).toThrow(/Invalid auth/);
  });
});
