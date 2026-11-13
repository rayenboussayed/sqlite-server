import { bench, describe } from 'vitest';
import { CacheService } from '../src/resources/cache/cache.service.js';

/**
 * `/cache` hot-path benchmarks (5-minute default TTL). TTL expiry itself is
 * lazy — an expired row is only deleted when read and observed stale — so
 * its cost shows up in the `get` paths rather than in a timer loop.
 */

const service = new CacheService();
const key = (i: number) => `cache:bench:${i}`;
const keys = (count: number) => Array.from({ length: count }, (_, i) => key(i));

await service.set(
  Array.from({ length: 1000 }, (_, i) => ({
    key: key(i),
    value: { n: i },
  })),
);

const entries1000 = Array.from({ length: 1000 }, (_, i) => ({
  key: key(i),
  value: { n: i, ts: 0 },
}));

describe('cache', () => {
  bench(
    'get hit (1 key)',
    async () => {
      await service.get([key(42)]);
    },
    { throws: true },
  );

  bench(
    'get hit (100 keys)',
    async () => {
      await service.get(keys(100));
    },
    { throws: true },
  );

  bench(
    'set 1000 entries (upsert)',
    async () => {
      await service.set(entries1000);
    },
    { throws: true },
  );
});
