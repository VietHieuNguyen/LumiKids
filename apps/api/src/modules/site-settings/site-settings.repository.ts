import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface SiteSettingRow {
  siteName: string;
  tagline: string | null;
  logoObjectKey: string | null;
  logoMimeType: string | null;
  landingScene: string;
  updatedAt: Date;
}

/** The single SiteSetting row (id 1); absent until an admin first saves. */
@Injectable()
export class SiteSettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  find(): Promise<SiteSettingRow | null> {
    return this.prisma.siteSetting.findUnique({ where: { id: 1 } });
  }
  save(
    data: Partial<Omit<SiteSettingRow, 'updatedAt'>>,
  ): Promise<SiteSettingRow> {
    return this.prisma.siteSetting.upsert({
      where: { id: 1 },
      create: { id: 1, ...data },
      update: data,
    });
  }
}
