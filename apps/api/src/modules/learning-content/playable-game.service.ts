import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { gameContentSchema, getGameContentAssetIds } from '@lumikids/shared';
import type {
  GameContent,
  PlayableGameDetail,
  PlayableGamePage,
  PlayableGameQuery,
} from '@lumikids/shared';
import { buildAbility } from '../../common/security/ability.js';
import type { Principal } from '../../common/security/principal.js';
import { GameAssetService } from '../game-assets/game-asset.service.js';
import { GameLibraryRepository } from './game-library.repository.js';
import type { PlayableVersion } from './game-library.repository.js';

/** Learner-facing read access to saved games; does not grant library permissions. */
@Injectable()
export class PlayableGameService {
  constructor(
    private readonly repository: GameLibraryRepository,
    private readonly assets: GameAssetService,
  ) {}
  private authorize(user: Principal) {
    if (!buildAbility(user).can('PLAY_GAMES', 'Gameplay'))
      throw new ForbiddenException();
  }
  private present(row: PlayableVersion): PlayableGameDetail {
    const content = gameContentSchema.parse(row.content);
    return {
      versionId: row.versionId,
      name: row.activity.name,
      gameType: row.gameType,
      difficulty: row.difficulty,
      coverAssetIds: getGameContentAssetIds(content).slice(0, 3),
      content,
    };
  }
  async list(
    user: Principal,
    query: PlayableGameQuery,
  ): Promise<PlayableGamePage> {
    this.authorize(user);
    const page = await this.repository.listPlayable(query);
    return {
      ...page,
      items: page.items.map((row) => {
        const { content: _content, ...summary } = this.present(row);
        return summary;
      }),
    };
  }
  async detail(user: Principal, versionId: string) {
    this.authorize(user);
    const row = await this.repository.findPlayable(versionId);
    if (!row)
      throw new NotFoundException(
        'Trò chơi không tồn tại hoặc đã được lưu trữ.',
      );
    return this.present(row);
  }
  async readUrl(user: Principal, versionId: string, assetId: string) {
    const game = await this.detail(user, versionId);
    if (!getGameContentAssetIds(game.content).includes(assetId))
      throw new ForbiddenException('Ảnh không thuộc trò chơi này.');
    return this.assets.playableGameReadUrl(user, assetId);
  }
  /** Immutable version content for replaying an existing session, even after archive. */
  async versionContent(versionId: string): Promise<GameContent> {
    const row = await this.repository.findVersionContent(versionId);
    if (!row) throw new NotFoundException('Trò chơi không tồn tại.');
    return gameContentSchema.parse(row.content);
  }
}
