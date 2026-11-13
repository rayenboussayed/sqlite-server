import { QueueController } from './queue.controller.js';
import type { QueueService } from './queue.service.js';

describe('QueueController', () => {
  const enqueue = vi.fn();
  const dequeue = vi.fn();
  const ack = vi.fn();
  const nack = vi.fn();
  const size = vi.fn();
  const controller = new QueueController({
    enqueue,
    dequeue,
    ack,
    nack,
    size,
  } as unknown as QueueService);

  beforeEach(() => {
    enqueue.mockReset();
    dequeue.mockReset();
    ack.mockReset();
    nack.mockReset();
    size.mockReset();
  });

  it('delegates enqueue to the service', () => {
    const result = { ids: [1, 2] };
    enqueue.mockReturnValue(result);

    const body = { jobs: [{ payload: 'a', delayMs: 0 }] };

    expect(controller.enqueue(body)).toBe(result);
    expect(enqueue).toHaveBeenCalledWith(body);
  });

  it('delegates dequeue to the service', () => {
    const result = { jobs: [{ id: 1, payload: 'a' }] };
    dequeue.mockReturnValue(result);

    const body = { limit: 1, visibilityMs: 30_000 };

    expect(controller.dequeue(body)).toBe(result);
    expect(dequeue).toHaveBeenCalledWith(body);
  });

  it('delegates ack to the service', () => {
    ack.mockReturnValue({ acked: 1 });

    expect(controller.ack({ ids: [1] })).toEqual({ acked: 1 });
    expect(ack).toHaveBeenCalledWith({ ids: [1] });
  });

  it('delegates nack to the service', () => {
    nack.mockReturnValue({ released: 1 });

    expect(controller.nack({ ids: [1] })).toEqual({ released: 1 });
    expect(nack).toHaveBeenCalledWith({ ids: [1] });
  });

  it('delegates size to the service', () => {
    size.mockReturnValue({ pending: 3 });

    expect(controller.size()).toEqual({ pending: 3 });
    expect(size).toHaveBeenCalledTimes(1);
  });
});
