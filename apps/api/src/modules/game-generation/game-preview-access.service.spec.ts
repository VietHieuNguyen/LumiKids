import { JwtService } from '@nestjs/jwt';
import type { ConfigType } from '@nestjs/config';
import { createHmac, randomUUID } from 'node:crypto';
import authConfig from '../../common/config/auth.config.js';
import type { GameContent } from '@lumikids/shared';
import { GamePreviewAccessService } from './game-preview-access.service.js';
import type { GameAssetService } from '../game-assets/game-asset.service.js';
import {
  adminFixture,
  assetFixture,
} from '../../../test/game-asset.fixtures.js';

describe('Generated Preview access (offline; real signing, mocked assets)', () => {
  const config: ConfigType<typeof authConfig> = {
    secret: 'fixture-only-auth-secret-1234567890',
    issuer: 'fixture-api',
    audience: 'fixture-web',
    accessTtlSeconds: 900,
    refreshTtlSeconds: 604800,
    cookieSecure: false,
    cookieSameSite: 'lax',
    cookieName: 'fixture-cookie',
    cookiePath: '/api/v1/auth',
    origins: ['http://web.example.test'],
    rateTtlMs: 60000,
    rateLimit: 10,
  };
  const jwt = new JwtService();
  const assets = { generatedPreviewReadUrl: vi.fn() };
  const user = {
    ...adminFixture,
    roles: ['ROLE_TEACHER' as const],
    permissions: ['GENERATE_GAME_CONTENT' as const],
  };
  const content: GameContent = {
    schemaVersion: 1,
    gameType: 'COUNTING',
    instruction: 'Đếm bóng',
    items: [{ id: 'b1', assetId: assetFixture.id }],
    choices: [
      { id: 'a', value: 1 },
      { id: 'b', value: 2 },
    ],
    correctChoiceId: 'a',
    completionRule: 'CORRECT_CHOICE',
  };
  const service = new GamePreviewAccessService(
    jwt,
    assets as unknown as GameAssetService,
    config,
  );
  it('binds new save proofs to exact content while allowing object key reordering', async () => {
    const proof = await service.issue(user, content);
    await expect(
      service.verifyForSave(user, proof.token, { ...content }),
    ).resolves.toBeUndefined();
    await expect(
      service.verifyForSave(user, proof.token, {
        ...content,
        instruction: 'Changed',
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      service.verifyForSave(
        { ...user, userId: randomUUID() },
        proof.token,
        content,
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  const key = createHmac('sha256', config.secret)
    .update('lumikids.generated-preview.v1')
    .digest('base64url');
  beforeEach(() => {
    vi.resetAllMocks();
    assets.generatedPreviewReadUrl.mockResolvedValue({
      url: 'http://media.example.test/signed',
      expiresIn: 900,
    });
  });
  it('issues a one-hour proof limited to the user and unique content asset IDs', async () => {
    const proof = await service.issue(user, content);
    const decoded = jwt.decode<{
      sub: string;
      assetIds: string[];
      exp: number;
      iat: number;
      tokenUse: string;
    }>(proof.token);
    expect(decoded.sub).toBe(user.userId);
    expect(decoded.assetIds).toEqual([assetFixture.id]);
    expect(decoded.exp - decoded.iat).toBe(3600);
    expect(decoded.tokenUse).toBe('generated-preview');
    await expect(
      service.readUrl(user, assetFixture.id, proof.token),
    ).resolves.toHaveProperty('url');
    expect(assets.generatedPreviewReadUrl).toHaveBeenCalledExactlyOnceWith(
      user,
      assetFixture.id,
    );
  });
  it('rejects assets outside scope and proofs belonging to another user', async () => {
    const proof = await service.issue(user, content);
    await expect(
      service.readUrl(user, randomUUID(), proof.token),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      service.readUrl(
        { ...user, userId: randomUUID() },
        assetFixture.id,
        proof.token,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(assets.generatedPreviewReadUrl).not.toHaveBeenCalled();
  });
  it('rejects tampered signatures, malformed tokens and Auth access tokens', async () => {
    const proof = await service.issue(user, content);
    const parts = proof.token.split('.');
    parts[2] = (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1);
    const access = await jwt.signAsync(
      { tokenUse: 'access' },
      {
        secret: config.secret,
        audience: config.audience,
        issuer: config.issuer,
        subject: user.userId,
        expiresIn: 900,
      },
    );
    for (const token of [parts.join('.'), 'invalid', access])
      await expect(
        service.readUrl(user, assetFixture.id, token),
      ).rejects.toMatchObject({ status: 403 });
    expect(assets.generatedPreviewReadUrl).not.toHaveBeenCalled();
  });
  it('cannot use Preview proof as an Auth access token', async () => {
    const proof = await service.issue(user, content);
    await expect(
      jwt.verifyAsync(proof.token, {
        secret: config.secret,
        audience: config.audience,
        issuer: config.issuer,
      }),
    ).rejects.toThrow();
  });
  it('expires even when user still has a valid Auth session', async () => {
    const token = await jwt.signAsync(
      {
        tokenUse: 'generated-preview',
        assetIds: [assetFixture.id],
        iat: Math.floor(Date.now() / 1000) - 3600,
      },
      {
        secret: key,
        algorithm: 'HS256',
        issuer: config.issuer,
        audience: 'lumikids-generated-preview',
        subject: user.userId,
        expiresIn: 1,
      },
    );
    await expect(
      service.readUrl(user, assetFixture.id, token),
    ).rejects.toMatchObject({
      publicCode: 'PREVIEW_ACCESS_EXPIRED',
      status: 410,
    });
    expect(assets.generatedPreviewReadUrl).not.toHaveBeenCalled();
  });
  it('requires current generation permission on both issuance and resolution', async () => {
    const proof = await service.issue(user, content);
    const revoked = { ...user, permissions: [] };
    await expect(service.issue(revoked, content)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      service.readUrl(revoked, assetFixture.id, proof.token),
    ).rejects.toMatchObject({ status: 403 });
    expect(assets.generatedPreviewReadUrl).not.toHaveBeenCalled();
  });
});
