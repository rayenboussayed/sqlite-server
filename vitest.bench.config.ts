import { defineConfig } from 'vitest/config';

/**
 * Benchmarks for the `/db`, `/kv`, `/cache` and `/queue` storage paths.
 *
 * These are opt-in numbers, never part of the test or coverage gates.
 * Run once with `npm run bench`; compare locally against a baseline with
 * `npm run bench:compare` (advisory only — results are machine-local).
 * Set `BENCH_DB_PATH=/tmp/bench.sqlite` to measure the WAL file path
 * instead of the default `:memory:`.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    root: './',
    // `vitest bench` uses `benchmark.include`; nothing here runs as tests.
    include: [],
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
    benchmark: {
      include: ['bench/**/*.bench.ts'],
      // v4 does not exclude dist/ from the default benchmark exclude — set it.
      exclude: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
      reporters: ['default'],
    },
    // In-memory databases only by default — benchmarks never touch ./database/.
    env: {
      SQLITE_DATABASE_PATH: process.env.BENCH_DB_PATH ?? ':memory:',
      SQLITE_CACHE_PATH: ':memory:',
      SQLITE_KV_PATH: ':memory:',
      QUEUE_STORAGE_PATH: ':memory:',
    },
  },
});
