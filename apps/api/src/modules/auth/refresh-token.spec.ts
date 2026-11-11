import {
  newRefreshToken,
  parseRefreshToken,
  verifierMatches,
} from './refresh-token.js';

describe('opaque refresh token verifiers', () => {
  it('stores only a verifier and rejects a changed secret with the same selector', () => {
    const token = newRefreshToken();
    const another = newRefreshToken();
    expect(token.verifier).toMatch(/^[a-f0-9]{64}$/);
    expect(token.verifier).not.toContain(token.value);
    expect(parseRefreshToken(token.value)?.tokenId).toBe(token.tokenId);
    expect(verifierMatches(token.value, token.verifier)).toBe(true);
    expect(
      verifierMatches(
        `${token.tokenId}.${another.value.split('.')[1]}`,
        token.verifier,
      ),
    ).toBe(false);
    expect(verifierMatches(token.value, 'bad')).toBe(false);
  });
  it.each([undefined, null, '', 'bad', {}, 'x'.repeat(1000)])(
    'rejects malformed values (%#)',
    (value) => {
      expect(parseRefreshToken(value)).toBeNull();
    },
  );
});
