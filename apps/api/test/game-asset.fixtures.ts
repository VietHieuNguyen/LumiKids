import type { ConfigType } from '@nestjs/config';
import type storageConfig from '../src/common/config/storage.config.js';
import type { Principal } from '../src/common/security/principal.js';
import type { GameAsset } from '../src/generated/prisma/client.js';

export const storageFixture: ConfigType<typeof storageConfig> = {
  endpoint: 'http://internal-storage.example.test:9000',
  publicEndpoint: 'http://media.example.test:9000',
  region: 'us-east-1',
  bucket: 'fixture-assets',
  accessKey: 'fixture-key',
  secretKey: 'fixture-secret',
  forcePathStyle: true,
  readUrlTtlSeconds: 900,
  maxSizeBytes: 5 * 1024 * 1024,
};
export const adminFixture: Principal = {
  userId: 'f49baa68-d624-4cc3-a501-8e922d970732',
  fullName: 'Fixture',
  email: 'fixture@example.test',
  phone: '',
  address: '',
  status: 'ACTIVE',
  roles: ['ROLE_ADMIN'],
  permissions: ['READ_GAME_ASSETS', 'MANAGE_GAME_ASSETS'],
};
export const teacherFixture: Principal = {
  ...adminFixture,
  roles: ['ROLE_TEACHER'],
  permissions: ['READ_GAME_ASSETS'],
};
export const assetFixture: GameAsset = {
  id: '61aa17ec-2380-4f39-9229-045322b692d7',
  name: 'Red ball',
  objectKey: 'game-assets/61aa17ec-2380-4f39-9229-045322b692d7.png',
  originalFileName: 'ball.png',
  mimeType: 'image/png',
  sizeBytes: 68,
  objectType: 'BALL',
  tags: ['ball', 'red'],
  attributes: { color: 'RED' },
  status: 'ACTIVE',
  createdBy: adminFixture.userId,
  createdAt: new Date('2026-11-10T00:00:00Z'),
  updatedAt: new Date('2026-11-10T00:00:00Z'),
};
export const pngFixture = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64',
);

export function stubStorageEnvironment(): void {
  vi.stubEnv('S3_ENDPOINT', storageFixture.endpoint);
  vi.stubEnv('S3_PUBLIC_ENDPOINT', storageFixture.publicEndpoint);
  vi.stubEnv('S3_REGION', storageFixture.region);
  vi.stubEnv('S3_BUCKET', storageFixture.bucket);
  vi.stubEnv('S3_ACCESS_KEY', storageFixture.accessKey);
  vi.stubEnv('S3_SECRET_KEY', storageFixture.secretKey);
}
