import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { GameAssetService } from './game-asset.service.js';
import type { GameAssetRepository } from './game-asset.repository.js';
import type { StorageService } from '../../common/storage/storage.service.js';
import {
  adminFixture,
  assetFixture,
  pngFixture,
  storageFixture,
  teacherFixture,
} from '../../../test/game-asset.fixtures.js';
import { createAssetSchema, listAssetsSchema } from './dto/game-asset.dto.js';

describe('GameAsset business operations (offline)', () => {
  const repository = {
    create: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    list: vi.fn(),
  };
  const storage = {
    uploadObject: vi.fn(),
    deleteObject: vi.fn(),
    getReadUrl: vi.fn(),
  };
  let service: GameAssetService;
  const metadata = createAssetSchema.parse({
    name: 'Red ball',
    objectType: 'BALL',
    tags: ['red'],
    attributes: { color: 'RED' },
  });
  const file = () => ({
    buffer: pngFixture,
    size: pngFixture.length,
    originalname: '../ball.png',
    mimetype: 'image/png',
  });

  beforeEach(() => {
    vi.resetAllMocks();
    repository.create.mockResolvedValue(assetFixture);
    repository.findById.mockResolvedValue(assetFixture);
    repository.update.mockResolvedValue(assetFixture);
    storage.uploadObject.mockResolvedValue(undefined);
    storage.deleteObject.mockResolvedValue(undefined);
    service = new GameAssetService(
      repository as unknown as GameAssetRepository,
      storage as unknown as StorageService,
      storageFixture,
    );
  });
  afterEach(() => vi.restoreAllMocks());

  it('uploads using a new UUID key and records detected MIME/creator/actual size', async () => {
    const image = { ...file(), mimetype: 'text/plain', size: 999999 };
    await expect(
      service.upload(adminFixture, metadata, image),
    ).resolves.toEqual(assetFixture);
    const key: unknown = storage.uploadObject.mock.calls[0][0];
    expect(key).toMatch(/^game-assets\/[0-9a-f-]{36}\.png$/);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ...metadata,
        objectKey: key,
        originalFileName: 'ball.png',
        mimeType: 'image/png',
        sizeBytes: pngFixture.length,
        createdBy: adminFixture.userId,
      }),
    );
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });
  it('rejects missing file', async () => {
    await expect(service.upload(adminFixture, metadata)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
  it('rejects fake PNG content even if client claims image/png', async () => {
    await expect(
      service.upload(adminFixture, metadata, {
        ...file(),
        buffer: Buffer.from('<svg>fake</svg>'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.uploadObject).not.toHaveBeenCalled();
  });
  it('rejects actual buffer above limit even if reported size is small', async () => {
    await expect(
      service.upload(adminFixture, metadata, {
        ...file(),
        size: 1,
        buffer: Buffer.alloc(storageFixture.maxSizeBytes + 1),
      }),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
    expect(storage.uploadObject).not.toHaveBeenCalled();
  });
  it('does not insert metadata when storage upload fails', async () => {
    storage.uploadObject.mockRejectedValue(new ServiceUnavailableException());
    await expect(
      service.upload(adminFixture, metadata, file()),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(repository.create).not.toHaveBeenCalled();
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });
  it('cleans up precisely the newly uploaded object if DB insert fails', async () => {
    repository.create.mockRejectedValue(new Error('private database details'));
    await expect(
      service.upload(adminFixture, metadata, file()),
    ).rejects.toThrow('Asset metadata could not be saved.');
    expect(storage.deleteObject).toHaveBeenCalledExactlyOnceWith(
      storage.uploadObject.mock.calls[0][0],
    );
  });
  it('logs an orphan key without leaking storage/database errors if cleanup fails', async () => {
    repository.create.mockRejectedValue(new Error('private database details'));
    storage.deleteObject.mockRejectedValue(
      new Error('private storage details'),
    );
    const logger = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    await expect(
      service.upload(adminFixture, metadata, file()),
    ).rejects.toThrow('Asset metadata could not be saved.');
    expect(logger).toHaveBeenCalledWith(
      expect.stringMatching(
        /^GameAsset cleanup failed; orphan objectKey=game-assets\//,
      ),
    );
    expect(JSON.stringify(logger.mock.calls)).not.toContain('private');
  });
  it('does not infer management rights from an admin role alone', async () => {
    await expect(
      service.upload({ ...adminFixture, permissions: [] }, metadata, file()),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(storage.uploadObject).not.toHaveBeenCalled();
  });
  it('allows teacher to read ACTIVE metadata', async () => {
    await expect(
      service.detail(teacherFixture, assetFixture.id),
    ).resolves.toEqual(assetFixture);
  });
  it('rejects reader without asset permissions', async () => {
    await expect(
      service.detail({ ...teacherFixture, permissions: [] }, assetFixture.id),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('does not let teacher manage assets', async () => {
    await expect(
      service.update(teacherFixture, assetFixture.id, { name: 'Changed' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.setStatus(teacherFixture, assetFixture.id, 'INACTIVE'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.update).not.toHaveBeenCalled();
  });
  it('returns 404 for missing asset', async () => {
    repository.findById.mockResolvedValue(null);
    await expect(
      service.detail(adminFixture, assetFixture.id),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.update(adminFixture, assetFixture.id, { name: 'Changed' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it('allows manager to inspect inactive asset but blocks teacher', async () => {
    repository.findById.mockResolvedValue({
      ...assetFixture,
      status: 'INACTIVE',
    });
    await expect(
      service.detail(adminFixture, assetFixture.id),
    ).resolves.toMatchObject({ status: 'INACTIVE' });
    await expect(
      service.readUrl(teacherFixture, assetFixture.id),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(storage.getReadUrl).not.toHaveBeenCalled();
  });
  it('updates metadata without changing any file', async () => {
    const patch = {
      name: 'Blue ball',
      tags: ['blue'],
      attributes: { color: 'BLUE' },
    };
    await service.update(adminFixture, assetFixture.id, patch);
    expect(repository.update).toHaveBeenCalledExactlyOnceWith(
      assetFixture.id,
      patch,
    );
    expect(storage.uploadObject).not.toHaveBeenCalled();
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });
  it('changes status both ways without deleting or replacing storage content', async () => {
    await service.setStatus(adminFixture, assetFixture.id, 'INACTIVE');
    await service.setStatus(adminFixture, assetFixture.id, 'ACTIVE');
    expect(repository.update).toHaveBeenNthCalledWith(1, assetFixture.id, {
      status: 'INACTIVE',
    });
    expect(repository.update).toHaveBeenNthCalledWith(2, assetFixture.id, {
      status: 'ACTIVE',
    });
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });
  it('passes bounded ACTIVE filters and pagination to repository', async () => {
    const query = listAssetsSchema.parse({
      page: '2',
      pageSize: '10',
      objectType: 'BALL',
      tags: '["red"]',
      attributes: '{"color":"RED"}',
    });
    repository.list.mockResolvedValue({
      items: [],
      pagination: { page: 2, pageSize: 10, total: 0, totalPages: 0 },
    });
    await service.list(teacherFixture, query);
    expect(repository.list).toHaveBeenCalledExactlyOnceWith(query);
  });
  it('requires management rights to list INACTIVE assets', async () => {
    await expect(
      service.list(
        teacherFixture,
        listAssetsSchema.parse({ status: 'INACTIVE' }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('returns a temporary URL without saving it in metadata', async () => {
    const result = { url: 'https://media.example.test/signed', expiresIn: 900 };
    storage.getReadUrl.mockResolvedValue(result);
    await expect(
      service.readUrl(teacherFixture, assetFixture.id),
    ).resolves.toEqual(result);
    expect(storage.getReadUrl).toHaveBeenCalledExactlyOnceWith(
      assetFixture.objectKey,
      'image/png',
    );
    expect(repository.update).not.toHaveBeenCalled();
  });
});
