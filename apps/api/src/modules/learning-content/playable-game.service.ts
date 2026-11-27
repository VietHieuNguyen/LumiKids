import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  withLegacyInstruction,
  gameContentSchema,
  getGameContentAssetIds,
} from '@lumikids/shared';
import type {
  GameContent,
  PlayableGameDetail,
  PlayableGamePage,
  PlayableGameQuery,
} from '@lumikids/shared';
import { buildAbility } from '../../common/security/ability.js';
import type { ChildPrincipal } from '../../common/security/principal.js';
import { GameAssetService } from '../game-assets/game-asset.service.js';
import { AssignmentsService } from './assignments.service.js';
import { GameLibraryRepository } from './game-library.repository.js';
import type { PlayableVersion } from './game-library.repository.js';

/**
 * Learner-facing read access to saved games; does not grant library permissions. A child sees and starts
 * only games assigned to them and open right now (AssignmentsService is the single gate).
 */
@Injectable()
export class PlayableGameService {
  constructor(
    private readonly repository: GameLibraryRepository,
    private readonly assets: GameAssetService,
    private readonly assignments: AssignmentsService,
  ) {}
  private authorize(player: ChildPrincipal) {
    if (!buildAbility(player).can('PLAY_GAMES', 'Gameplay'))
      throw new ForbiddenException();
  }
  private present(row: PlayableVersion): PlayableGameDetail {
    const content = gameContentSchema.parse(withLegacyInstruction(row.content));
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
    player: ChildPrincipal,
    query: PlayableGameQuery,
  ): Promise<PlayableGamePage> {
    this.authorize(player);
    const allowed = await this.assignments.playableVersionIds(player.childId);
    const page = await this.repository.listPlayable(query, [...allowed]);
    return {
      ...page,
      items: page.items.map((row) => {
        const { content: _content, ...summary } = this.present(row);
        return summary;
      }),
    };
  }
  async detail(player: ChildPrincipal, versionId: string, assignmentId?: string) {
    this.authorize(player);
    if (assignmentId) {
      const { version } = await this.assignments.requirePlayableAssignment(
        player.childId,
        assignmentId,
        versionId,
      );
      return this.present(version);
    }
    const allowed = await this.assignments.playableVersionIds(player.childId);
    const row = allowed.has(versionId)
      ? await this.repository.findPlayable(versionId)
      : null;
    if (!row)
      throw new NotFoundException(
        'Trò chơi chưa được giao cho con hoặc đã hết giờ chơi.',
      );
    return this.present(row);
  }
  async readUrl(player: ChildPrincipal, versionId: string, assetId: string) {
    const game = await this.detail(player, versionId);
    if (!getGameContentAssetIds(game.content).includes(assetId))
      throw new ForbiddenException('Ảnh không thuộc trò chơi này.');
    return this.assets.playableGameReadUrl(player, assetId);
  }
  /** Immutable version content for replaying an existing session, even after archive. */
  async versionContent(versionId: string): Promise<GameContent> {
    const row = await this.repository.findVersionContent(versionId);
    if (!row) throw new NotFoundException('Trò chơi không tồn tại.');
    return gameContentSchema.parse(withLegacyInstruction(row.content));
  }
}
