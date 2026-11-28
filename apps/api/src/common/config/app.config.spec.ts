import { assertDevModeAllowed } from './app.config.js';

const local = 'postgresql://user:pw@localhost:5432/lumikids_db';

describe('dev mode safety', () => {
  it('is never refused in standard mode', () => {
    expect(() => assertDevModeAllowed({ PORT: 4000, APP_MODE: 'standard', NODE_ENV: 'production', DATABASE_URL: 'postgresql://x@db.example/x' })).not.toThrow();
  });

  it('is allowed only on a local machine with a local database', () => {
    expect(() => assertDevModeAllowed({ PORT: 4000, APP_MODE: 'dev', NODE_ENV: 'development', DATABASE_URL: local })).not.toThrow();
  });

  it('is refused when NODE_ENV is production', () => {
    expect(() => assertDevModeAllowed({ PORT: 4000, APP_MODE: 'dev', NODE_ENV: 'production', DATABASE_URL: local })).toThrow(/production/);
  });

  it('is refused for a remote database', () => {
    expect(() => assertDevModeAllowed({ PORT: 4000, APP_MODE: 'dev', NODE_ENV: 'development', DATABASE_URL: 'postgresql://u:p@db.example.com:5432/lumikids_db' })).toThrow(/local database/);
  });

  it('is refused without a readable DATABASE_URL', () => {
    expect(() => assertDevModeAllowed({ PORT: 4000, APP_MODE: 'dev', NODE_ENV: 'development' })).toThrow(/DATABASE_URL/);
  });
});
