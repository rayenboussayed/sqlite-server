import { describe, expect, it } from 'vitest';
import { KvService } from '../../src/resources/kv/kv.service.js';
import { measureHeap } from '../helpers/measureHeap.js';

/**
 * Regression guard: repeated get/set cycles must not retain JS heap.
 *
 * Threshold is generous (3–5x the expected few-MB noise from V8's
 * backing stores); a real leak — an unbounded map, an accumulating
 * array — shows up as tens to hundreds of MB over 20k operations.
 */
describe('kv memory regression', () => {
  it('10k get/set cycles do not grow the heap', async () => {
    const service = new KvService();
    const workload = async () => {
      for (let i = 0; i < 10_000; i++) {
        await service.set([
          { key: `k${i % 1000}`, value: { i, payload: 'x'.repeat(32) } },
        ]);
        await service.get([`k${i % 1000}`]);
      }
    };

    const { heapUsedDelta } = await measureHeap(workload, 1);
    console.log(`kv heapUsedDelta: ${(heapUsedDelta / 1024 / 1024).toFixed(2)} MB`);

    expect(heapUsedDelta).toBeLessThan(15 * 1024 * 1024);
  });
});
