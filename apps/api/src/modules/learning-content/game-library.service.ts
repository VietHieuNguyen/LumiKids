import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  gameContentSchema,
  withLegacyInstruction,
  getGameContentAssetIds,
  getGameContentAssetIssues,
} from '@lumikids/shared';
import type {
  AssessmentCriterion,
  GameLibraryQuery,
  SaveGameInput,
  SavedGameDetail,
} from '@lumikids/shared';
import { ApiProblem } from '../../common/http/api-problem.js';
import { buildAbility } from '../../common/security/ability.js';
import type { Principal } from '../../common/security/principal.js';
import { CurriculumService } from '../curriculum/curriculum.service.js';
import { GameAssetService } from '../game-assets/game-asset.service.js';
import { GamePreviewAccessService } from '../game-generation/game-preview-access.service.js';
import { contentDigest } from '../game-generation/content-digest.js';
import { GameLibraryRepository } from './game-library.repository.js';
import type { LibraryVersion } from './game-library.repository.js';

@Injectable()
export class GameLibraryService {
  constructor(
    private readonly repository: GameLibraryRepository,
    private readonly curriculum: CurriculumService,
    private readonly assets: GameAssetService,
    private readonly previews: GamePreviewAccessService,
  ) {}
  private authorize(user: Principal, permission: 'READ_GAMES' | 'SAVE_GAMES') {
    if (!buildAbility(user).can(permission, 'GameLibrary'))
      throw new ForbiddenException();
  }
  private canManageAll(user: Principal) {
    return buildAbility(user).can('MANAGE_ALL_GAMES', 'GameLibrary');
  }
  private async requireVersion(user: Principal, id: string) {
    const row = await this.repository.find(id);
    if (
      !row ||
      (row.activity.status === 'ARCHIVED' &&
        row.activity.createdBy !== user.userId &&
        !this.canManageAll(user))
    )
      throw new NotFoundException(
        'Trò chơi không tồn tại hoặc đã được lưu trữ.',
      );
    return row;
  }
  private async criteria() {
    return (await this.curriculum.list()).flatMap((skill) => skill.criterions);
  }
  private present(
    row: LibraryVersion,
    criteria: AssessmentCriterion[],
  ): SavedGameDetail {
    const content = gameContentSchema.parse(withLegacyInstruction(row.content));
    return {
      activityId: row.activityId,
      versionId: row.versionId,
      versionNumber: row.versionNumber,
      name: row.activity.name,
      description: row.activity.description,
      gameType: row.gameType,
      difficulty: row.difficulty,
      ageGroup: row.activity.ageGroup,
      status: row.activity.status,
      createdBy: row.activity.createdBy,
      creatorName: row.activity.creator.fullName,
      createdAt: row.createdAt.toISOString(),
      criterions: criteria.filter((c) =>
        row.criterions.some(
          (selected) => selected.criterionCode === c.criterionCode,
        ),
      ),
      coverAssetIds: getGameContentAssetIds(content).slice(0, 3),
      content,
    };
  }
  async list(user: Principal, query: GameLibraryQuery) {
    this.authorize(user, 'READ_GAMES');
    const [page, criteria] = await Promise.all([
      this.repository.list(query, user.userId, this.canManageAll(user)),
      this.criteria(),
    ]);
    return {
      ...page,
      items: page.items.map((row) => {
        const { content: _content, ...summary } = this.present(row, criteria);
        return summary;
      }),
    };
  }
  async detail(user: Principal, versionId: string) {
    this.authorize(user, 'READ_GAMES');
    return this.present(
      await this.requireVersion(user, versionId),
      await this.criteria(),
    );
  }
  async save(user: Principal, input: SaveGameInput) {
    this.authorize(user, 'SAVE_GAMES');
    this.authorize(user, 'READ_GAMES');
    if(input.content.gameType==='QUANTITY' && (input.criterionCodes.length!==1 || input.criterionCodes[0]!=='42')) throw new BadRequestException('Quantity games require criterion 42.');
    if(input.content.gameType==='QUANTITY_COMPARISON_CHANGE' && (input.criterionCodes.length!==1 || input.criterionCodes[0]!=='43')) throw new BadRequestException('Comparison games require criterion 43.');
    const fingerprint = contentDigest({
      name: input.name,
      description: input.description,
      difficulty: input.difficulty,
      ageGroupId: input.ageGroupId,
      criterionCodes: [...input.criterionCodes].sort(),
      content: input.content,
    });
    const existing = await this.repository.findRequest(
      user.userId,
      input.saveRequestId,
    );
    if (existing) {
      if (existing.saveFingerprint !== fingerprint)
        throw new ConflictException(
          'Yêu cầu lưu này đã được dùng cho nội dung khác.',
        );
      return this.detail(user, existing.versions[0].versionId);
    }
    await this.previews.verifyForSave(user, input.previewToken, input.content);
    await this.curriculum.requireCodes(input.criterionCodes);
    if (!(await this.repository.ageGroupExists(input.ageGroupId)))
      throw new ApiProblem('AGE_GROUP_INVALID');
    const assets = await this.assets.generationAssets(
      user,
      getGameContentAssetIds(input.content),
    );
    if (getGameContentAssetIssues(input.content, assets).length)
      throw new ConflictException(
        'Học liệu của trò chơi không còn tồn tại hoặc đã ngừng sử dụng.',
      );
    let saved;
    try {
      saved = await this.repository.create(user.userId, input, fingerprint);
    } catch (error) {
      // A concurrent retry of the same request must not create a second game.
      if (
        typeof error !== 'object' ||
        error === null ||
        !('code' in error) ||
        error.code !== 'P2002'
      )
        throw error;
      const retry = await this.repository.findRequest(
        user.userId,
        input.saveRequestId,
      );
      if (!retry || retry.saveFingerprint !== fingerprint)
        throw new ConflictException(
          'Yêu cầu lưu đã thay đổi. Vui lòng tải lại kho.',
        );
      saved = retry;
    }
    return this.detail(user, saved.versions[0].versionId);
  }
  async readUrl(user: Principal, versionId: string, assetId: string) {
    this.authorize(user, 'READ_GAMES');
    const row = await this.requireVersion(user, versionId);
    if (
      !getGameContentAssetIds(
        gameContentSchema.parse(withLegacyInstruction(row.content)),
      ).includes(assetId)
    )
      throw new ForbiddenException('Ảnh không thuộc trò chơi đã lưu.');
    return this.assets.savedGameReadUrl(user, assetId);
  }
  /** Who may archive a game may also set its age group (metadata: the versioned content is untouched). */
  private requireManager(user: Principal, row: LibraryVersion) {
    if (this.canManageAll(user)) return;
    this.authorize(user, 'SAVE_GAMES');
    if (row.activity.createdBy !== user.userId)
      throw new ForbiddenException(
        'Bạn chỉ có thể quản lý trò chơi do mình tạo.',
      );
  }
  async ageGroup(user: Principal, versionId: string, ageGroupId: string) {
    this.authorize(user, 'READ_GAMES');
    const row = await this.requireVersion(user, versionId);
    this.requireManager(user, row);
    if (!(await this.repository.ageGroupExists(ageGroupId)))
      throw new ApiProblem('AGE_GROUP_INVALID');
    await this.repository.setAgeGroup(row.activityId, ageGroupId);
    return this.detail(user, versionId);
  }
  async status(
    user: Principal,
    versionId: string,
    status: 'ACTIVE' | 'ARCHIVED',
  ) {
    this.authorize(user, 'READ_GAMES');
    const row = await this.requireVersion(user, versionId);
    if (!this.canManageAll(user)) {
      this.authorize(user, 'SAVE_GAMES');
      if (row.activity.createdBy !== user.userId)
        throw new ForbiddenException(
          'Bạn chỉ có thể quản lý trò chơi do mình tạo.',
        );
    }
    if (!['ACTIVE', 'ARCHIVED'].includes(status))
      throw new BadRequestException();
    await this.repository.setStatus(row.activityId, status);
    return this.detail(user, versionId);
  }
}
