import { createHmac, randomInt } from 'node:crypto';

/** Letters and digits that a child cannot mix up: no 0/O, 1/I/L. */
export const LOGIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const LOGIN_CODE_LENGTH = 8;

/** A fresh random code, e.g. "K7MQ-2HXA" (the hyphen is only for reading it aloud). */
export function generateLoginCode(): string {
  let code = '';
  for (let i = 0; i < LOGIN_CODE_LENGTH; i += 1)
    code += LOGIN_CODE_ALPHABET[randomInt(LOGIN_CODE_ALPHABET.length)];
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** Accepts any case, spaces and hyphens; null when it cannot be a login code. */
export function normalizeLoginCode(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 32) return null;
  const code = input.toUpperCase().replace(/[\s-]/g, '');
  if (code.length !== LOGIN_CODE_LENGTH) return null;
  for (const char of code) if (!LOGIN_CODE_ALPHABET.includes(char)) return null;
  return code;
}

/**
 * Keyed digest stored instead of the code. A plain hash of a short code could be brute-forced offline from a
 * database copy; the key lives only in configuration. Deterministic, so the digest is also the lookup key.
 */
export function loginCodeDigest(
  normalizedCode: string,
  secret: string,
): string {
  return createHmac('sha256', secret).update(normalizedCode).digest('hex');
}
