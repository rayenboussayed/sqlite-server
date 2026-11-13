import { defineConfig } from 'vitest/config';

/**
 * Memory regression tests — a separate gate from the unit suite (no coverage).
 *
 * These run long, sequential, single-fork loops with `--expose-gc` so heap
 * deltas can be asserted deterministically. Run with `npm run test:memory`.
 * The tests intentionally assert on `heapUsed` only: RSS and external memory
 * include node:sqlite's native buffers, which are not a leak signal.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/memory/**/*.memory.test.ts'],
    // One fork, sequential files, no cross-file heap contention.
    pool: 'forks',
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 60_000,
    hookTimeout: 30_000,
    execArgv: ['--expose-gc'],
    // In-memory databases only — memory tests never touch ./database/.
    env: {
      SQLITE_DATABASE_PATH: ':memory:',
      SQLITE_CACHE_PATH: ':memory:',
      SQLITE_KV_PATH: ':memory:',
      QUEUE_STORAGE_PATH: ':memory:',
    },
  },
});
