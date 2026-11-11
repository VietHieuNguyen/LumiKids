import { randomBytes } from 'node:crypto';
import { PasswordService } from './password.service.js';

describe('Argon2id passwords', () => {
  const passwords = new PasswordService();
  it('uses salted Argon2id hashes and verifies only the correct password', async () => {
    const password = randomBytes(24).toString('base64url');
    const first = await passwords.hash(password);
    const second = await passwords.hash(password);
    expect(first).toMatch(/^\$argon2id\$/);
    expect(first).not.toBe(password);
    expect(first).not.toBe(second);
    expect(await passwords.verify(password, first)).toBe(true);
    expect(await passwords.verify('incorrect', first)).toBe(false);
  });
  it('fails safely for absent or corrupt password hashes', async () => {
    expect(await passwords.verify('incorrect')).toBe(false);
    expect(await passwords.verify('incorrect', 'not-an-argon2-hash')).toBe(
      false,
    );
  });
});
