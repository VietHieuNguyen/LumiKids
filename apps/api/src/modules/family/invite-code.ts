import { createHmac, randomInt } from 'node:crypto';
import { LOGIN_CODE_ALPHABET } from '../auth/child-login-code.js';

const LENGTH = 10;

/** A fresh invite code, e.g. "K7MQ2-HXAPD": easy to read aloud or type from a printed note. */
export function generateInviteCode(): string {
  let code = '';
  for (let i = 0; i < LENGTH; i += 1)
    code += LOGIN_CODE_ALPHABET[randomInt(LOGIN_CODE_ALPHABET.length)];
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

/** Accepts any case, spaces and hyphens, or a pasted link ending in ?code=…; null if it cannot be one. */
export function normalizeInviteCode(input: string): string | null {
  const fromLink = /[?&]code=([^&#\s]+)/i.exec(input)?.[1] ?? input;
  const code = decodeURIComponent(fromLink).toUpperCase().replace(/[\s-]/g, '');
  if (code.length !== LENGTH) return null;
  for (const char of code) if (!LOGIN_CODE_ALPHABET.includes(char)) return null;
  return code;
}

export function inviteCodeDigest(normalizedCode: string, secret: string): string {
  return createHmac('sha256', secret).update(`invite:${normalizedCode}`).digest('hex');
}
