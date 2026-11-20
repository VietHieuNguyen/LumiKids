import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Patch,
  Put,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  SITE_LOGO_MAX_BYTES,
  updateSiteSettingsSchema,
} from '@lumikids/shared';
import { Permissions, Public } from '../auth/decorators/auth.decorators.js';
import { SiteSettingsService } from './site-settings.service.js';
import type { LogoFile } from './site-settings.service.js';

/** Branding everyone sees (landing, sign-in, sidebars), readable before sign-in. */
@Controller('site-settings')
export class SiteSettingsController {
  constructor(private readonly settings: SiteSettingsService) {}

  @Public()
  @Get()
  get() {
    return this.settings.get();
  }

  /** The URL names a version (?v=), so the file itself may be cached for a day. */
  @Public()
  @Get('logo')
  async logo(@Res() response: Response) {
    const { body, mimeType } = await this.settings.logo();
    response
      .status(200)
      .type(mimeType)
      .set({
        'Cache-Control': 'public, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'",
      })
      .send(body);
  }
}

@Controller('admin/site-settings')
/** Admin only (MANAGE_USERS is held by ROLE_ADMIN alone, like the AI usage report). */
@Permissions('MANAGE_USERS')
export class AdminSiteSettingsController {
  constructor(private readonly settings: SiteSettingsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  get() {
    return this.settings.get();
  }

  @Patch()
  update(@Body() value: unknown) {
    const parsed = updateSiteSettingsSchema.safeParse(value);
    if (!parsed.success)
      throw new BadRequestException(
        'Kiểm tra tên trang (1–60 kí tự), khẩu hiệu (tối đa 160) và cảnh trang chủ.',
      );
    return this.settings.update(parsed.data);
  }

  @Put('logo')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: SITE_LOGO_MAX_BYTES, files: 1, fields: 0, parts: 2 },
    }),
  )
  replaceLogo(@UploadedFile() file?: LogoFile) {
    return this.settings.replaceLogo(file);
  }

  @Delete('logo')
  removeLogo() {
    return this.settings.removeLogo();
  }
}
