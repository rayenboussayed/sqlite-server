/**
 * Measures the V8 heap footprint of a workload.
 *
 * Node must be started with `--expose-gc` (see `vitest.config.memory.ts`) so
 * the collector can be driven deterministically; without it this throws
 * instead of silently reporting garbage-polluted deltas.
 */

export interface MeasureHeapResult {
  /** heapUsed after the measured run minus heapUsed before it, both post-GC. */
  heapUsedDelta: number;
  /** Wall-clock time of the measured run, in milliseconds. */
  durationMs: number;
}

interface GcGlobal {
  gc?: () => void;
}

function collect() {
  const gc = (globalThis as GcGlobal).gc;
  // Two rounds cover finalizers that re-enable collection.
  gc?.();
  gc?.();
}

/**
 * Runs `workload` `warmup` times unmeasured (JIT and SQLite page-cache
 * warmup), then collects and measures one more run's heap delta. The workload
 * should use large loops (≥5k iterations) so the signal dwarfs V8's
 * allocator noise; thresholds elsewhere in the suite are set generously for
 * the same reason.
 */
export async function measureHeap(
  workload: () => void | Promise<void>,
  warmup = 0,
): Promise<MeasureHeapResult> {
  if (typeof (globalThis as GcGlobal).gc !== 'function') {
    throw new Error(
      'global.gc is unavailable — run with --expose-gc (see vitest.config.memory.ts)',
    );
  }
  for (let i = 0; i < warmup; i++) await workload();

  collect();
  const before = process.memoryUsage().heapUsed;
  const start = performance.now();
  await workload();
  const durationMs = performance.now() - start;
  collect();

  return { heapUsedDelta: process.memoryUsage().heapUsed - before, durationMs };
}
