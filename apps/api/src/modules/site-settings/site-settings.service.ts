import {
  BadRequestException,
  FileTypeValidator,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { SITE_LOGO_MAX_BYTES, landingSceneSchema } from '@lumikids/shared';
import type { SiteSettings, UpdateSiteSettingsInput } from '@lumikids/shared';
import { ApiProblem } from '../../common/http/api-problem.js';
import { StorageService } from '../../common/storage/storage.service.js';
import { SiteSettingsRepository } from './site-settings.repository.js';
import type { SiteSettingRow } from './site-settings.repository.js';

export interface LogoFile {
  buffer: Buffer;
  size: number;
  mimetype: string;
}

const DEFAULTS = {
  siteName: 'LumiKids',
  tagline: null,
  landingScene: 'VALLEY',
} as const;
const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/** The logo path carries a short hash of its key, so a new logo is a new URL (safe to cache). */
function logoPath(key: string | null) {
  if (!key) return null;
  const version = createHash('sha256').update(key).digest('hex').slice(0, 12);
  return `/api/v1/site-settings/logo?v=${version}`;
}

function view(row: SiteSettingRow | null): SiteSettings {
  const scene = landingSceneSchema.safeParse(row?.landingScene);
  return {
    siteName: row?.siteName ?? DEFAULTS.siteName,
    tagline: row?.tagline ?? DEFAULTS.tagline,
    logoPath: logoPath(row?.logoObjectKey ?? null),
    landingScene: scene.success ? scene.data : DEFAULTS.landingScene,
    updatedAt: row?.updatedAt.toISOString() ?? null,
  };
}

@Injectable()
export class SiteSettingsService {
  private readonly logger = new Logger(SiteSettingsService.name);
  constructor(
    private readonly repository: SiteSettingsRepository,
    private readonly storage: StorageService,
  ) {}

  async get(): Promise<SiteSettings> {
    return view(await this.repository.find());
  }

  async update(input: UpdateSiteSettingsInput): Promise<SiteSettings> {
    return view(await this.repository.save(input));
  }

  /** Stores a new logo, then removes the old file; the content type comes from the bytes, not the client. */
  async replaceLogo(file?: LogoFile): Promise<SiteSettings> {
    if (!file?.buffer?.length)
      throw new BadRequestException('Hãy chọn một ảnh logo.');
    if (file.buffer.length > SITE_LOGO_MAX_BYTES)
      throw new ApiProblem('SITE_LOGO_TOO_LARGE');
    const validator = new FileTypeValidator({
      fileType: /^(image\/png|image\/jpeg|image\/webp)$/,
      overrideMimeType: true,
    });
    if (!(await validator.isValid(file)))
      throw new ApiProblem('SITE_LOGO_TYPE');
    const extension = EXTENSIONS[file.mimetype];
    if (!extension) throw new ApiProblem('SITE_LOGO_TYPE');
    const previous = (await this.repository.find())?.logoObjectKey ?? null;
    const key = `site/logo-${randomUUID()}.${extension}`;
    await this.storage.uploadObject(key, file.buffer, file.mimetype);
    const saved = await this.repository.save({
      logoObjectKey: key,
      logoMimeType: file.mimetype,
    });
    await this.removeQuietly(previous);
    return view(saved);
  }

  async removeLogo(): Promise<SiteSettings> {
    const previous = (await this.repository.find())?.logoObjectKey ?? null;
    const saved = await this.repository.save({
      logoObjectKey: null,
      logoMimeType: null,
    });
    await this.removeQuietly(previous);
    return view(saved);
  }

  /** The logo bytes for the public route; 404 when the built-in logo is in use. */
  async logo(): Promise<{ body: Buffer; mimeType: string }> {
    const row = await this.repository.find();
    if (!row?.logoObjectKey || !row.logoMimeType) throw new NotFoundException();
    const body = await this.storage.readObject(row.logoObjectKey);
    if (!body) throw new NotFoundException();
    return { body, mimeType: row.logoMimeType };
  }

  private async removeQuietly(key: string | null) {
    if (!key) return;
    try {
      await this.storage.deleteObject(key);
    } catch {
      // The new logo is already saved; a leftover file only costs storage.
      this.logger.warn('Old site logo could not be removed from storage.');
    }
  }
}
