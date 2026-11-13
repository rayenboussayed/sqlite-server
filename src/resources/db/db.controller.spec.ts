import { DbController } from './db.controller.js';
import type { DbService } from './db.service.js';

describe('DbController', () => {
  const query = vi.fn();
  const prepareOnly = vi.fn();
  const batch = vi.fn();
  const controller = new DbController({
    query,
    prepareOnly,
    batch,
  } as unknown as DbService);

  beforeEach(() => {
    query.mockReset();
    prepareOnly.mockReset();
    batch.mockReset();
  });

  it('delegates query to the service', () => {
    const result = { sql: 'SELECT 1', rowCount: 1 };
    query.mockReturnValue(result);

    const body = { sql: 'SELECT 1', params: [] };

    expect(controller.query(body)).toBe(result);
    expect(query).toHaveBeenCalledWith(body);
  });

  it('delegates prepare to the service', () => {
    const result = { sql: 'SELECT 1', columns: [{ name: '1', type: 'INTEGER' }] };
    prepareOnly.mockReturnValue(result);

    expect(controller.prepare({ sql: 'SELECT 1' })).toBe(result);
    expect(prepareOnly).toHaveBeenCalledWith({ sql: 'SELECT 1' });
  });

  it('delegates batch to the service', () => {
    const result = { results: [] };
    batch.mockReturnValue(result);

    const body = { statements: [{ sql: 'SELECT 1', params: [] }] };

    expect(controller.batch(body)).toBe(result);
    expect(batch).toHaveBeenCalledWith(body);
  });
});
