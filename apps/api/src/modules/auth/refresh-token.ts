import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { z } from 'zod';

export function newRefreshToken() {
  const tokenId = randomUUID();
  const value = `${tokenId}.${randomBytes(32).toString('base64url')}`;
  return { tokenId, value, verifier: tokenVerifier(value) };
}

export function tokenVerifier(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function parseRefreshToken(
  value: unknown,
): { tokenId: string; value: string } | null {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/.test(value)
  )
    return null;
  const tokenId = value.slice(0, 36);
  if (!z.uuid().safeParse(tokenId).success) return null;
  return { tokenId, value };
}

export function verifierMatches(value: string, expected: string): boolean {
  const actual = Buffer.from(tokenVerifier(value), 'hex');
  const stored = Buffer.from(expected, 'hex');
  return actual.length === stored.length && timingSafeEqual(actual, stored);
}
