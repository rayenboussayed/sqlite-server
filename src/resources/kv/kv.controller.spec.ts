import { KvController } from './kv.controller.js';
import type { KvService } from './kv.service.js';

describe('KvController', () => {
  const get = vi.fn();
  const set = vi.fn();
  const remove = vi.fn();
  const controller = new KvController({
    get,
    set,
    remove,
  } as unknown as KvService);

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
    set.mockResolvedValue([true, true]);

    const entries = [
      { key: 'a', value: 1 },
      { key: 'b', value: 'two' },
    ];
    const result = await controller.set(entries);

    expect(set).toHaveBeenCalledWith(entries);
    expect(result).toEqual({ results: [true, true] });
  });

  it('delegates remove with the keys and reports per-key flags', async () => {
    remove.mockResolvedValue([false, true]);

    const result = await controller.remove([{ key: 'a' }, { key: 'b' }]);

    expect(remove).toHaveBeenCalledWith(['a', 'b']);
    expect(result).toEqual({ results: [false, true] });
  });
});
