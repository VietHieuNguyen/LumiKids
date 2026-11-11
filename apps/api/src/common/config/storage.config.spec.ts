import storageConfig from './storage.config.js';
import { stubStorageEnvironment } from '../../../test/game-asset.fixtures.js';

describe('Storage configuration', () => {
  beforeEach(stubStorageEnvironment);
  afterEach(() => vi.unstubAllEnvs());
  it('supports different internal/signing endpoints and secure limits', () => {
    expect(storageConfig()).toMatchObject({
      endpoint: 'http://internal-storage.example.test:9000',
      publicEndpoint: 'http://media.example.test:9000',
      forcePathStyle: true,
      maxSizeBytes: 5242880,
      readUrlTtlSeconds: 900,
    });
  });
  it.each([
    ['S3_ACCESS_KEY', ''],
    ['S3_SECRET_KEY', ''],
    ['S3_ENDPOINT', 'http://user:secret@example.test'],
    ['S3_ENDPOINT', 'http://example.test/path'],
    ['S3_PUBLIC_ENDPOINT', 'ftp://example.test'],
    ['S3_READ_URL_TTL_SECONDS', '99999'],
    ['GAME_ASSET_MAX_SIZE_BYTES', '0'],
    ['S3_FORCE_PATH_STYLE', 'no'],
  ])(
    'rejects invalid configuration without echoing values (%s)',
    (name, value) => {
      vi.stubEnv(name, value);
      expect(() => storageConfig()).toThrow(
        'Invalid S3 configuration. Set application credentials and endpoints using apps/api/.env.example.',
      );
    },
  );
});
