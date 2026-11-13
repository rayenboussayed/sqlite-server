import { CacheController } from './cache.controller.js';
import type { CacheService } from './cache.service.js';

describe('CacheController', () => {
  const get = vi.fn();
  const set = vi.fn();
  const remove = vi.fn();
  const controller = new CacheController({
    get,
    set,
    remove,
  } as unknown as CacheService);

  beforeEach(() => {
    get.mockReset();
    set.mockReset();
    remove.mockReset();
  });

  it('delegates get with the keys and wraps values', async () => {
    get.mockResolvedValue(['a', undefined]);

    const result = await controller.get([{ key: 'a' }, { key: 'b' }]);

    expect(get).toHaveBeenCalledWith(['a', 'b']);
    expect(result).toEqual({ values: ['a', undefined] });
  });

  it('delegates set and reports per-entry flags', async () => {
    set.mockResolvedValue([true, false]);

    const entries = [
      { key: 'a', value: 1 },
      { key: 'b', value: 2, ttl: 5000 },
    ];
    const result = await controller.set(entries);

    expect(set).toHaveBeenCalledWith(entries);
    expect(result).toEqual({ results: [true, false] });
  });

  it('delegates remove with the keys and reports per-key flags', async () => {
    remove.mockResolvedValue([true, true]);

    const result = await controller.remove([{ key: 'a' }, { key: 'b' }]);

    expect(remove).toHaveBeenCalledWith(['a', 'b']);
    expect(result).toEqual({ results: [true, true] });
  });
});
