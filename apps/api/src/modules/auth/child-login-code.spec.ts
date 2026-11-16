import {
  LOGIN_CODE_ALPHABET,
  generateLoginCode,
  loginCodeDigest,
  normalizeLoginCode,
} from './child-login-code.js';

describe('child login codes', () => {
  it('generates readable 8-symbol codes without look-alike characters', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      const code = generateLoginCode();
      expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      expect(code).not.toMatch(/[01OIL]/);
      expect(normalizeLoginCode(code)).toHaveLength(8);
      seen.add(code);
    }
    expect(seen.size).toBe(200);
    expect(LOGIN_CODE_ALPHABET).toHaveLength(31);
  });

  it('tolerates case, spaces and hyphens but nothing else', () => {
    expect(normalizeLoginCode(' k7mq-2hxa ')).toBe('K7MQ2HXA');
    expect(normalizeLoginCode('K7MQ 2HXA')).toBe('K7MQ2HXA');
    expect(normalizeLoginCode('K7MQ2HX')).toBeNull();
    expect(normalizeLoginCode('K7MQ2HX0')).toBeNull(); // 0 is not in the alphabet
    expect(normalizeLoginCode(12345678)).toBeNull();
    expect(normalizeLoginCode('A'.repeat(40))).toBeNull();
  });

  it('stores a keyed digest that depends on the secret', () => {
    const a = loginCodeDigest('K7MQ2HXA', 'x'.repeat(32));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(loginCodeDigest('K7MQ2HXA', 'x'.repeat(32))).toBe(a);
    expect(loginCodeDigest('K7MQ2HXA', 'y'.repeat(32))).not.toBe(a);
    expect(loginCodeDigest('K7MQ2HXB', 'x'.repeat(32))).not.toBe(a);
  });
});
