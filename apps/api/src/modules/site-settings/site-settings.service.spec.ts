import { MAIL_LOGO_PNG_BASE64 } from '../../common/mail/mail-logo.js';
import type { StorageService } from '../../common/storage/storage.service.js';
import { SiteSettingsRepository } from './site-settings.repository.js';
import type { SiteSettingRow } from './site-settings.repository.js';
import { SiteSettingsService } from './site-settings.service.js';

class MemoryRepository extends SiteSettingsRepository {
  row: SiteSettingRow | null = null;
  constructor() {
    super({} as never);
  }
  find() {
    return Promise.resolve(this.row);
  }
  save(data: Partial<Omit<SiteSettingRow, 'updatedAt'>>) {
    this.row = {
      siteName: 'LumiKids',
      tagline: null,
      logoObjectKey: null,
      logoMimeType: null,
      landingScene: 'VALLEY',
      ...this.row,
      ...data,
      updatedAt: new Date('2026-11-20T00:00:00Z'),
    };
    return Promise.resolve(this.row);
  }
}

function setup() {
  const repository = new MemoryRepository();
  const storage = {
    uploadObject: vi.fn(() => Promise.resolve()),
    deleteObject: vi.fn(() => Promise.resolve()),
    readObject: vi.fn(() => Promise.resolve(Buffer.from('x'))),
  };
  const service = new SiteSettingsService(
    repository,
    storage as unknown as StorageService,
  );
  return { service, repository, storage };
}
const png = () => {
  const buffer = Buffer.from(MAIL_LOGO_PNG_BASE64, 'base64');
  return { buffer, size: buffer.length, mimetype: 'image/png' };
};

describe('SiteSettingsService', () => {
  it('falls back to the built-in branding before anything is saved', async () => {
    expect(await setup().service.get()).toEqual({
      siteName: 'LumiKids',
      tagline: null,
      logoPath: null,
      landingScene: 'VALLEY',
      updatedAt: null,
    });
  });

  it('saves the name and tagline', async () => {
    const { service } = setup();
    expect(
      await service.update({
        siteName: 'Trường Mầm non Hoa Sen',
        tagline: null,
      }),
    ).toMatchObject({ siteName: 'Trường Mầm non Hoa Sen', tagline: null });
  });

  it('checks the logo bytes, not the claimed type, and gives each logo a new URL', async () => {
    const { service, storage } = setup();
    const text = Buffer.from('<svg onload="alert(1)"/>');
    await expect(
      service.replaceLogo({
        buffer: text,
        size: text.length,
        mimetype: 'image/png',
      }),
    ).rejects.toMatchObject({ publicCode: 'SITE_LOGO_TYPE' });
    expect(storage.uploadObject).not.toHaveBeenCalled();

    const first = await service.replaceLogo(png());
    const second = await service.replaceLogo(png());
    expect(first.logoPath).toMatch(
      /^\/api\/v1\/site-settings\/logo\?v=[0-9a-f]{12}$/,
    );
    expect(second.logoPath).not.toBe(first.logoPath);
    // The first file is removed once the second one is saved.
    expect(storage.deleteObject).toHaveBeenCalledTimes(1);
  });

  it('keeps the new logo when the old file cannot be removed', async () => {
    const { service, storage } = setup();
    await service.replaceLogo(png());
    storage.deleteObject.mockRejectedValueOnce(new Error('down'));
    expect((await service.replaceLogo(png())).logoPath).not.toBeNull();
  });

  it('returns to the built-in logo and serves nothing after removal', async () => {
    const { service } = setup();
    await service.replaceLogo(png());
    expect((await service.removeLogo()).logoPath).toBeNull();
    await expect(service.logo()).rejects.toThrow();
  });
});
