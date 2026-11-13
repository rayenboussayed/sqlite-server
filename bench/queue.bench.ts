import { bench, describe } from 'vitest';
import { QueueService } from '../src/resources/queue/queue.service.js';

/**
 * `/queue` benchmarks. Enqueue runs inside a `withTransactionControl`
 * transaction; dequeue claims via `UPDATE … RETURNING` over the
 * `jobs_claimable_idx` covering index.
 *
 * The claim benchmarks draw from a large pre-seeded backlog; as it drains,
 * claims shift toward the empty-queue path, so absolute numbers here are a
 * worst-case-ish smoke read, not a stable SLA.
 */

const service = new QueueService();

// Batches of 100 (the enqueue schema's per-call cap), in-memory.
for (let i = 0; i < 1500; i++) {
  service.enqueue({
    jobs: Array.from({ length: 100 }, (_, j) => ({
      payload: { n: i * 100 + j },
      delayMs: 0,
    })),
  });
}

describe('queue', () => {
  bench(
    'enqueue 100 jobs (single transaction)',
    () => {
      service.enqueue({
        jobs: Array.from({ length: 100 }, (_, j) => ({
          payload: { n: j },
          delayMs: 0,
        })),
      });
    },
    { throws: true },
  );

  bench(
    'dequeue claim 1 job',
    () => {
      service.dequeue({ limit: 1, visibilityMs: 30_000 });
    },
    { throws: true, time: 250 },
  );

  bench(
    'dequeue claim 10 jobs',
    () => {
      service.dequeue({ limit: 10, visibilityMs: 30_000 });
    },
    { throws: true, time: 250 },
  );

  bench(
    'enqueue → dequeue → ack cycle',
    () => {
      service.enqueue({ jobs: [{ payload: { n: 0 }, delayMs: 0 }] });
      const { jobs } = service.dequeue({ limit: 1, visibilityMs: 30_000 });
      service.ack({ ids: jobs.map((job) => job.id) });
    },
    { throws: true },
  );

  bench(
    'size',
    () => {
      service.size();
    },
    { throws: true },
  );
});
