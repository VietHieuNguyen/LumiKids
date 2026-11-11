import type { MockInstance } from 'vitest';
import {
  DeleteObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ServiceUnavailableException } from '@nestjs/common';
import { StorageService } from './storage.service.js';
import {
  pngFixture,
  storageFixture,
} from '../../../test/game-asset.fixtures.js';

vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: vi.fn() }));

describe('S3-compatible storage (offline)', () => {
  let storage: StorageService;
  let send: MockInstance<S3Client['send']>;
  const signedUrl =
    'http://media.example.test:9000/fixture-assets/game-assets/test.png?signature=fixture';
  beforeEach(() => {
    send = vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);
    vi.mocked(getSignedUrl).mockResolvedValue(signedUrl);
    storage = new StorageService(storageFixture);
  });
  afterEach(() => {
    storage.onModuleDestroy();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('checks bucket then PUTs immutable content without a public ACL', async () => {
    await storage.uploadObject('game-assets/test.png', pngFixture, 'image/png');
    const calls = send.mock.calls;
    expect(calls[0][0]).toBeInstanceOf(HeadBucketCommand);
    expect(calls[1][0]).toBeInstanceOf(PutObjectCommand);
    expect(calls[1][0].input).toEqual({
      Bucket: storageFixture.bucket,
      Key: 'game-assets/test.png',
      Body: pngFixture,
      ContentType: 'image/png',
      ContentLength: pngFixture.length,
      IfNoneMatch: '*',
      CacheControl: 'private, no-store',
    });
  });
  it('sanitizes missing bucket, access denied, connection and upload errors', async () => {
    send.mockRejectedValue(new Error('fixture-secret driver details'));
    await expect(storage.checkBucket()).rejects.toThrow(
      'Asset storage is unavailable.',
    );
    await expect(
      storage.uploadObject('game-assets/new.png', pngFixture, 'image/png'),
    ).rejects.toThrow('Asset upload failed.');
  });
  it('cleans up only a specified key', async () => {
    await storage.deleteObject('game-assets/orphan.png');
    const command = send.mock.calls[0][0];
    expect(command).toBeInstanceOf(DeleteObjectCommand);
    expect(command.input).toEqual({
      Bucket: storageFixture.bucket,
      Key: 'game-assets/orphan.png',
    });
  });
  it('signs using the browser endpoint, region and configured lifetime without hostname rewriting', async () => {
    const result = await storage.getReadUrl(
      'game-assets/test.png',
      'image/png',
    );
    expect(send.mock.calls[0][0]).toBeInstanceOf(HeadObjectCommand);
    const [client, command, options] = vi.mocked(getSignedUrl).mock.calls[0];
    expect(await client.config.endpoint?.()).toMatchObject({
      hostname: 'media.example.test',
      port: 9000,
    });
    expect(await client.config.region()).toBe('us-east-1');
    expect(command.input).toMatchObject({
      Bucket: storageFixture.bucket,
      Key: 'game-assets/test.png',
      ResponseContentType: 'image/png',
    });
    expect(options).toEqual({ expiresIn: 900 });
    expect(result).toMatchObject({ url: signedUrl, expiresIn: 900 });
  });
  it('does not sign for missing/unavailable objects', async () => {
    send.mockRejectedValue(new Error('NoSuchKey fixture-secret'));
    await expect(
      storage.getReadUrl('game-assets/test.png', 'image/png'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(getSignedUrl).not.toHaveBeenCalled();
  });
  it('sanitizes presigner failure', async () => {
    vi.mocked(getSignedUrl).mockRejectedValue(new Error('fixture-secret'));
    await expect(
      storage.getReadUrl('game-assets/test.png', 'image/png'),
    ).rejects.toThrow('Asset read URL is unavailable.');
  });
});
