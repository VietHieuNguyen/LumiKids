import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { getGameContentAssetIds } from '@lumikids/shared';
import type { GameContent } from '@lumikids/shared';
import authConfig from '../../common/config/auth.config.js';
import { ApiProblem } from '../../common/http/api-problem.js';
import { buildAbility } from '../../common/security/ability.js';
import type { Principal } from '../../common/security/principal.js';
import { GameAssetService } from '../game-assets/game-asset.service.js';

const AUDIENCE = 'lumikids-generated-preview';
const TTL_SECONDS = 3600;
const scopeSchema = z.object({
  sub: z.uuid(),
  tokenUse: z.literal('generated-preview'),
  assetIds: z.array(z.uuid()).min(1).max(40),
  exp: z.number().int(),
});

/** Stateless proof issued only after GameGenerationService validates the result. */
@Injectable()
export class GamePreviewAccessService {
  constructor(
    private readonly jwt: JwtService,
    private readonly assets: GameAssetService,
    @Inject(authConfig.KEY)
    private readonly config: ConfigType<typeof authConfig>,
  ) {}
  private key(): string {
    // Domain-separated key: this proof cannot be used as an Auth access token.
    return createHmac('sha256', this.config.secret)
      .update('lumikids.generated-preview.v1')
      .digest('base64url');
  }
  private authorize(user: Principal): void {
    if (
      !buildAbility(user).can('GENERATE_GAME_CONTENT', 'GameContentGeneration')
    )
      throw new ForbiddenException();
  }
  async issue(user: Principal, content: GameContent) {
    this.authorize(user);
    const assetIds = getGameContentAssetIds(content);
    if (!assetIds.length || assetIds.length > 40)
      throw new ApiProblem('AI_OUTPUT_INVALID');
    const now = Math.floor(Date.now() / 1000);
    const token = await this.jwt.signAsync(
      { tokenUse: 'generated-preview', assetIds, iat: now },
      {
        secret: this.key(),
        algorithm: 'HS256',
        issuer: this.config.issuer,
        audience: AUDIENCE,
        subject: user.userId,
        expiresIn: TTL_SECONDS,
      },
    );
    return {
      token,
      expiresAt: new Date((now + TTL_SECONDS) * 1000).toISOString(),
    };
  }
  async readUrl(user: Principal, assetId: string, previewToken: string) {
    this.authorize(user);
    let payload: unknown;
    try {
      payload = await this.jwt.verifyAsync(previewToken, {
        secret: this.key(),
        algorithms: ['HS256'],
        issuer: this.config.issuer,
        audience: AUDIENCE,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'TokenExpiredError')
        throw new ApiProblem('PREVIEW_ACCESS_EXPIRED');
      throw new ForbiddenException(
        'Quyền đọc ảnh của bản chơi thử không hợp lệ.',
      );
    }
    const parsed = scopeSchema.safeParse(payload);
    if (
      !parsed.success ||
      parsed.data.sub !== user.userId ||
      !parsed.data.assetIds.includes(assetId)
    )
      throw new ForbiddenException(
        'Ảnh không thuộc bản chơi thử của tài khoản này.',
      );
    return this.assets.generatedPreviewReadUrl(user, assetId);
  }
}
