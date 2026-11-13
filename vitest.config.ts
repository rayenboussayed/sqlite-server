import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    coverage: {
      // Measure every source file, not just the ones unit tests import
      // (spec files stay excluded via vitest's defaults).
      include: ['src/**/*.ts'],
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
    // In-memory databases only — unit tests never touch ./database/.
    env: {
      SQLITE_DATABASE_PATH: ':memory:',
      SQLITE_CACHE_PATH: ':memory:',
      SQLITE_KV_PATH: ':memory:',
      QUEUE_STORAGE_PATH: ':memory:',
    },
  },
});
