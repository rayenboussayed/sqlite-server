import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Covers the import-time side effects of `environment.ts` (creating parent
 * directories for file-backed paths and parsing the DATABASE_EXTENSIONS
 * list) by loading the module fresh with stubbed env — the test suite
 * normally runs on `:memory:`, where none of that executes.
 */
describe('environment', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('creates parent directories and parses DATABASE_EXTENSIONS', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlite-server-env-'));

    try {
      vi.stubEnv('SQLITE_DATABASE_PATH', path.join(dir, 'nested', 'db.sqlite'));
      vi.stubEnv('SQLITE_CACHE_PATH', path.join(dir, 'cache.sqlite'));
      vi.stubEnv('SQLITE_KV_PATH', path.join(dir, 'kv.sqlite'));
      vi.stubEnv('QUEUE_STORAGE_PATH', path.join(dir, 'queue.sqlite'));
      vi.stubEnv('DATABASE_EXTENSIONS', ' vector , ,');

      const { environment } = await import('./environment.js');

      expect(environment.DATABASE_EXTENSIONS).toEqual(['vector']);
      expect(fs.existsSync(path.join(dir, 'nested'))).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
