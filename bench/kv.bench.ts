import { bench, describe } from 'vitest';
import { KvService } from '../src/resources/kv/kv.service.js';

/**
 * `/kv` benchmarks. Reads are indexed lookups on `(key, namespace)`; writes
 * are upserts. `getMany` batches `IN (…)` lists (Keyv internally caps at 998
 * bind parameters), so sizes straddling that cap are the interesting ones.
 */

const service = new KvService();
const key = (i: number) => `bench:${i}`;
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

describe('kv', () => {
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
    'get hit (900 keys, under the IN-list cap)',
    async () => {
      await service.get(keys(900));
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
