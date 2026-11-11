import { randomUUID } from 'node:crypto';
import { verifierMatches } from '../src/modules/auth/refresh-token.js';
import type { RotationResult } from '../src/modules/auth/auth-sessions.repository.js';

interface Session {
  sessionId: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}
interface Token {
  tokenId: string;
  verifier: string;
  expiresAt: Date;
  usedAt: Date | null;
  session: Session;
}

// HTTP contract tests only. Actual PostgreSQL locking is covered separately.
export class AuthTestStore {
  readonly tokens = new Map<string, Token>();

  create(
    userId: string,
    token: { tokenId: string; verifier: string },
    expiresAt: Date,
  ) {
    const session: Session = {
      sessionId: randomUUID(),
      userId,
      expiresAt,
      revokedAt: null,
    };
    this.tokens.set(token.tokenId, {
      tokenId: token.tokenId,
      verifier: token.verifier,
      expiresAt,
      usedAt: null,
      session,
    });
    return Promise.resolve(session);
  }

  find(tokenId: string) {
    return Promise.resolve(this.tokens.get(tokenId) ?? null);
  }

  rotate(
    tokenId: string,
    value: string,
    replacement: { tokenId: string; verifier: string },
  ): Promise<RotationResult> {
    const token = this.tokens.get(tokenId);
    if (
      !token ||
      !verifierMatches(value, token.verifier) ||
      token.session.revokedAt ||
      token.expiresAt <= new Date()
    )
      return Promise.resolve('invalid');
    if (token.usedAt) {
      token.session.revokedAt = new Date();
      return Promise.resolve('reused');
    }
    token.usedAt = new Date();
    this.tokens.set(replacement.tokenId, {
      tokenId: replacement.tokenId,
      verifier: replacement.verifier,
      usedAt: null,
      session: token.session,
      expiresAt: token.session.expiresAt,
    });
    return Promise.resolve('rotated');
  }

  revoke(tokenId: string, value: string): Promise<void> {
    const token = this.tokens.get(tokenId);
    if (token && verifierMatches(value, token.verifier))
      token.session.revokedAt = new Date();
    return Promise.resolve();
  }
}
