import databaseConfig from './database.config.js';

describe('database configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('accepts a PostgreSQL URL without opening a connection', () => {
    const url = 'postgresql://fixture:fixture@localhost:5433/fixture';
    vi.stubEnv('DATABASE_URL', url);

    expect(databaseConfig()).toEqual({ url });
  });

  it.each([
    undefined,
    '',
    'https://fixture:private-password@localhost/fixture',
    'postgresql:fixture',
  ])(
    'rejects missing or invalid configuration with a sanitized message (%#)',
    (url) => {
      vi.stubEnv('DATABASE_URL', url);

      expect(() => databaseConfig()).toThrow(
        /^DATABASE_URL is required and must be a PostgreSQL connection URL\.$/,
      );
    },
  );
});
