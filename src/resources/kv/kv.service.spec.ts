import { Test, TestingModule } from '@nestjs/testing';
import { KvService } from './kv.service.js';

describe('KvService', () => {
  let service: KvService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [KvService],
    }).compile();

    service = module.get<KvService>(KvService);
  });

  it('round-trips JSON values and reports a set flag per entry', async () => {
    const entries = [
      { key: 'string', value: 'hello' },
      { key: 'number', value: 42 },
      { key: 'boolean', value: true },
      { key: 'object', value: { nested: [1, 2, 3] } },
      { key: 'array', value: [1, 'two', { three: 3 }] },
      { key: 'null', value: null },
    ];

    const results = await service.set(entries);

    expect(results).toEqual(entries.map(() => true));

    const values = await service.get(entries.map((entry) => entry.key));

    expect(values).toEqual([
      'hello',
      42,
      true,
      { nested: [1, 2, 3] },
      [1, 'two', { three: 3 }],
      null,
    ]);
  });

  it('returns undefined for missing keys', async () => {
    await service.set([{ key: 'present', value: 'here' }]);

    const values = await service.get(['present', 'missing']);

    expect(values[0]).toBe('here');
    expect(values[1]).toBeUndefined();
  });

  it('reports removal accurately, including a repeat delete', async () => {
    await service.set([{ key: 'gone', value: 1 }]);

    expect(await service.remove(['gone'])).toEqual([true]);
    expect(await service.remove(['gone'])).toEqual([false]);
    expect(await service.get(['gone'])).toEqual([undefined]);
  });
});
