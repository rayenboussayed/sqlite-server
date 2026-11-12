import { Test, TestingModule } from '@nestjs/testing';
import { QueueService } from './queue.service.js';
import type { EnqueueType } from './schema.js';

type Payload = EnqueueType['jobs'][number]['payload'];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('QueueService', () => {
  let service: QueueService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [QueueService],
    }).compile();

    service = module.get<QueueService>(QueueService);
  });

  function enqueueOne(payload: Payload = 'job', delayMs = 0) {
    return service.enqueue({ jobs: [{ payload, delayMs }] });
  }

  it('moves a job from pending to in-flight on dequeue', () => {
    const { ids } = enqueueOne({ kind: 'email', to: 'a@example.com' });

    expect(ids).toHaveLength(1);
    expect(service.size()).toEqual({ pending: 1 });

    const { jobs } = service.dequeue({ limit: 10, visibilityMs: 30_000 });

    expect(jobs).toHaveLength(1);
    expect(jobs[0].id).toBe(ids[0]);
    expect(jobs[0].payload).toEqual({ kind: 'email', to: 'a@example.com' });
    expect(service.size()).toEqual({ pending: 0 });
  });

  it('acks a dequeued job', () => {
    const { ids } = enqueueOne();
    service.dequeue({ limit: 1, visibilityMs: 30_000 });

    expect(service.ack({ ids })).toEqual({ acked: 1 });
    expect(service.dequeue({ limit: 10, visibilityMs: 30_000 })).toEqual({
      jobs: [],
    });
  });

  it('does not ack a job that was never dequeued', () => {
    const { ids } = enqueueOne();

    expect(service.ack({ ids })).toEqual({ acked: 0 });
    expect(service.size()).toEqual({ pending: 1 });
  });

  it('nacks a leased job back to pending', () => {
    const { ids } = enqueueOne();
    service.dequeue({ limit: 1, visibilityMs: 30_000 });

    expect(service.nack({ ids })).toEqual({ released: 1 });
    expect(service.size()).toEqual({ pending: 1 });

    const { jobs } = service.dequeue({ limit: 1, visibilityMs: 30_000 });

    expect(jobs.map((job) => job.id)).toEqual(ids);
  });

  it('holds delayed jobs until their delay elapses', async () => {
    enqueueOne('later', 30);

    expect(service.size()).toEqual({ pending: 0 });
    expect(service.dequeue({ limit: 10, visibilityMs: 30_000 }).jobs).toEqual(
      [],
    );

    await sleep(80);

    expect(service.size()).toEqual({ pending: 1 });

    const { jobs } = service.dequeue({ limit: 10, visibilityMs: 30_000 });

    expect(jobs.map((job) => job.payload)).toEqual(['later']);
  });

  it('re-delivers a job whose visibility lease expired', async () => {
    const { ids } = enqueueOne('retry');

    const first = service.dequeue({ limit: 1, visibilityMs: 20 });
    expect(first.jobs.map((job) => job.id)).toEqual(ids);

    await sleep(60);

    const second = service.dequeue({ limit: 1, visibilityMs: 20 });
    expect(second.jobs.map((job) => job.id)).toEqual(ids);
  });

  it('dequeues multiple jobs in one claim, limited by `limit`', () => {
    for (const payload of ['a', 'b', 'c', 'd']) enqueueOne(payload);

    const { jobs } = service.dequeue({ limit: 2, visibilityMs: 30_000 });

    expect(jobs).toHaveLength(2);
    expect(jobs.map((job) => job.payload)).toEqual(['a', 'b']);
    expect(service.size()).toEqual({ pending: 2 });
  });

  it('treats visibilityMs: 0 as an immediately reclaimable lease', () => {
    enqueueOne('instant');

    const first = service.dequeue({ limit: 1, visibilityMs: 0 });
    expect(first.jobs).toHaveLength(1);

    // Lease already expired — the same job is claimable again right away.
    const second = service.dequeue({ limit: 1, visibilityMs: 0 });
    expect(second.jobs.map((job) => job.id)).toEqual(
      first.jobs.map((job) => job.id),
    );
  });

  it('returns one id per enqueued job', () => {
    const { ids } = service.enqueue({
      jobs: [
        { payload: 1, delayMs: 0 },
        { payload: 2, delayMs: 0 },
        { payload: 3, delayMs: 0 },
      ],
    });

    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(service.size()).toEqual({ pending: 3 });
  });
});
