import {
  BadRequestException,
  ConflictException,
  FileTypeValidator,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import storageConfig from '../../common/config/storage.config.js';
import { StorageService } from '../../common/storage/storage.service.js';
import { buildAbility } from '../../common/security/ability.js';
import type { Principal } from '../../common/security/principal.js';
import type { PermissionCode } from '../../generated/prisma/enums.js';
import { GameAssetRepository } from './game-asset.repository.js';
import type {
  CreateAssetInput,
  ListAssetsInput,
  UpdateAssetInput,
} from './dto/game-asset.dto.js';

export interface AssetFile {
  buffer: Buffer;
  size: number;
  originalname: string;
  mimetype: string;
}

@Injectable()
export class GameAssetService {
  private readonly logger = new Logger(GameAssetService.name);
  constructor(
    private readonly repository: GameAssetRepository,
    private readonly storage: StorageService,
    @Inject(storageConfig.KEY)
    private readonly config: ConfigType<typeof storageConfig>,
  ) {}

  private authorize(user: Principal, permission: PermissionCode): void {
    if (!buildAbility(user).can(permission, 'GameAsset'))
      throw new ForbiddenException('Insufficient asset permission.');
  }
  private canManage(user: Principal): boolean {
    return buildAbility(user).can('MANAGE_GAME_ASSETS', 'GameAsset');
  }

  // Internal metadata-only integration. This does not grant Library/URL access to teachers.
  async generationCandidates(user: Principal, terms: string[]) {
    this.authorizeGeneration(user);
    return this.repository.searchForGeneration(terms.slice(0, 32));
  }
  async generationAssets(user: Principal, ids: string[]) {
    this.authorizeGeneration(user);
    return this.repository.findForGeneration([...new Set(ids)].slice(0, 40));
  }
  // Only the generation preview service calls this after verifying the signed per-user asset scope.
  async generatedPreviewReadUrl(user: Principal, id: string) {
    this.authorizeGeneration(user);
    const asset = await this.repository.findById(id);
    if (!asset) throw new NotFoundException('Game asset not found.');
    if (asset.status !== 'ACTIVE')
      throw new ConflictException('Game asset is inactive.');
    return this.storage.getReadUrl(asset.objectKey, asset.mimeType);
  }
  private authorizeGeneration(user: Principal): void {
    if (
      !buildAbility(user).can('GENERATE_GAME_CONTENT', 'GameContentGeneration')
    )
      throw new ForbiddenException('Insufficient generation permission.');
  }

  // Internal only: caller must first verify the asset belongs to an accessible saved version.
  async savedGameReadUrl(user: Principal, id: string) {
    if (!buildAbility(user).can('READ_GAMES', 'GameLibrary'))
      throw new ForbiddenException();
    const asset = await this.repository.findById(id);
    if (!asset) throw new NotFoundException('Học liệu của trò chơi không còn tồn tại.');
    if (asset.status !== 'ACTIVE')
      throw new ConflictException('Học liệu của trò chơi đang ngừng sử dụng.');
    return this.storage.getReadUrl(asset.objectKey, asset.mimeType);
  }

  async upload(user: Principal, metadata: CreateAssetInput, file?: AssetFile) {
    this.authorize(user, 'MANAGE_GAME_ASSETS');
    if (!file || !file.buffer?.length)
      throw new BadRequestException('An image file is required.');
    if (file.buffer.length > this.config.maxSizeBytes)
      throw new PayloadTooLargeException('Image exceeds the upload limit.');
    // Nest validates magic numbers using its bundled file-type dependency and replaces the untrusted MIME.
    const validator = new FileTypeValidator({
      fileType: /^(image\/png|image\/jpeg|image\/webp)$/,
      overrideMimeType: true,
    });
    if (!(await validator.isValid(file)))
      throw new BadRequestException(
        'Only PNG, JPEG and WebP image content is accepted.',
      );
    const extension = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/webp': 'webp',
    }[file.mimetype];
    if (!extension) throw new BadRequestException('Unsupported image content.');
    const id = randomUUID();
    const objectKey = `game-assets/${id}.${extension}`;
    const originalFileName =
      file.originalname
        .split(/[\\/]/)
        .pop()
        ?.split('')
        .filter(
          (character) =>
            character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
        )
        .join('')
        .slice(0, 255) || 'image';
    await this.storage.uploadObject(objectKey, file.buffer, file.mimetype);
    try {
      return await this.repository.create({
        id,
        ...metadata,
        objectKey,
        originalFileName,
        mimeType: file.mimetype,
        sizeBytes: file.buffer.length,
        createdBy: user.userId,
      });
    } catch {
      try {
        await this.storage.deleteObject(objectKey);
      } catch {
        this.logger.error(
          `GameAsset cleanup failed; orphan objectKey=${objectKey}`,
        );
      }
      throw new ServiceUnavailableException(
        'Asset metadata could not be saved.',
      );
    }
  }

  async list(user: Principal, query: ListAssetsInput) {
    this.authorize(user, 'READ_GAME_ASSETS');
    if (query.status === 'INACTIVE' && !this.canManage(user))
      throw new ForbiddenException(
        'Inactive assets require management permission.',
      );
    return this.repository.list(query);
  }

  async detail(user: Principal, id: string) {
    this.authorize(user, 'READ_GAME_ASSETS');
    const asset = await this.repository.findById(id);
    if (!asset) throw new NotFoundException('Game asset not found.');
    if (asset.status === 'INACTIVE' && !this.canManage(user))
      throw new ConflictException('Game asset is inactive.');
    return asset;
  }

  async update(user: Principal, id: string, data: UpdateAssetInput) {
    this.authorize(user, 'MANAGE_GAME_ASSETS');
    await this.requireExists(id);
    return this.repository.update(id, data);
  }
  async setStatus(user: Principal, id: string, status: 'ACTIVE' | 'INACTIVE') {
    this.authorize(user, 'MANAGE_GAME_ASSETS');
    await this.requireExists(id);
    return this.repository.update(id, { status });
  }
  async readUrl(user: Principal, id: string) {
    const asset = await this.detail(user, id);
    return this.storage.getReadUrl(asset.objectKey, asset.mimeType);
  }
  private async requireExists(id: string): Promise<void> {
    if (!(await this.repository.findById(id)))
      throw new NotFoundException('Game asset not found.');
  }
}
