import { describe, expect, it } from 'vitest';
import { QueueService } from '../../src/resources/queue/queue.service.js';
import { measureHeap } from '../helpers/measureHeap.js';

/**
 * Regression guard: the enqueue → dequeue → ack job lifecycle must not
 * retain JS heap or leak event-loop resources (timers, sockets, …).
 *
 * The heap threshold is generous for the same reason as the KV suite; the
 * resource count must not grow at all, since a single cycle creates no
 * long-lived handles.
 */
describe('queue memory regression', () => {
  it('5k enqueue/dequeue/ack cycles do not grow the heap or the resource count', async () => {
    const service = new QueueService();
    const resourcesBefore = process.getActiveResourcesInfo().length;
    const workload = () => {
      for (let i = 0; i < 5_000; i++) {
        service.enqueue({
          jobs: [{ payload: { i }, delayMs: 0 }],
        });
        const { jobs } = service.dequeue({ limit: 1, visibilityMs: 1_000 });
        service.ack({ ids: jobs.map((job) => job.id) });
      }
    };

    const { heapUsedDelta } = await measureHeap(workload, 1);
    console.log(`queue heapUsedDelta: ${(heapUsedDelta / 1024 / 1024).toFixed(2)} MB`);

    expect(heapUsedDelta).toBeLessThan(15 * 1024 * 1024);
    expect(process.getActiveResourcesInfo().length).toBeLessThanOrEqual(
      resourcesBefore,
    );
  });
});
