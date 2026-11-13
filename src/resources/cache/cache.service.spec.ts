import { Test, TestingModule } from '@nestjs/testing';
import { CacheService } from './cache.service.js';

describe('CacheService', () => {
  let service: CacheService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CacheService],
    }).compile();

    service = module.get<CacheService>(CacheService);
  });

  it('round-trips cached values under the default ttl', async () => {
    const results = await service.set([
      { key: 'user', value: { id: 1, roles: ['admin'] } },
      { key: 'count', value: 7 },
    ]);

    expect(results).toEqual([true, true]);

    const values = await service.get(['user', 'count']);

    expect(values).toEqual([{ id: 1, roles: ['admin'] }, 7]);
  });

  it('reports removal, including a repeat delete', async () => {
    await service.set([{ key: 'gone', value: 1 }]);

    expect(await service.remove(['gone'])).toEqual([true]);
    expect(await service.remove(['gone'])).toEqual([false]);
    expect(await service.get(['gone'])).toEqual([undefined]);
  });

  it('honours a per-entry ttl override', async () => {
    await service.set([{ key: 'ephemeral', value: 'gone soon', ttl: 1 }]);

    // The 1 ms ttl has certainly elapsed after this pause.
    await new Promise((resolve) => setTimeout(resolve, 25));

    const values = await service.get(['ephemeral']);

    expect(values[0]).toBeUndefined();
  });
});
