import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    // In-memory databases only — unit tests never touch ./database/.
    env: {
      SQLITE_DATABASE_PATH: ':memory:',
      SQLITE_CACHE_PATH: ':memory:',
      SQLITE_KV_PATH: ':memory:',
      QUEUE_STORAGE_PATH: ':memory:',
    },
  },
});
