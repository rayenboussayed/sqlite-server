import { bench, describe } from 'vitest';
import { DbService } from '../src/resources/db/db.service.js';

/**
 * `/db` benchmarks. `DbService` is synchronous (`node:sqlite`), so these
 * measure the full request-path cost: statement-split check → prepare →
 * bind → run/all → column projection. Run with `:memory:` by default.
 */

const service = new DbService();

service.query({
  sql: 'CREATE TABLE bench_items (id INTEGER PRIMARY KEY, name TEXT NOT NULL)',
  params: [],
});
service.query({
  sql: `INSERT INTO bench_items (name) VALUES ${Array.from(
    { length: 1000 },
    (_, i) => `('user-${i}')`,
  ).join(', ')}`,
  params: [],
});

describe('db.query', () => {
  bench(
    'SELECT by primary key',
    () => {
      service.query({
        sql: 'SELECT id, name FROM bench_items WHERE id = ?',
        params: [42],
      });
    },
    { throws: true },
  );

  bench(
    'INSERT',
    () => {
      service.query({
        sql: 'INSERT INTO bench_items (name) VALUES (?)',
        params: ['bench'],
      });
    },
    { throws: true },
  );

  bench(
    'batch of 10 statements',
    () => {
      service.batch({
        statements: Array.from({ length: 10 }, (_, i) => ({
          sql: 'SELECT id FROM bench_items WHERE id = ?',
          params: [i + 1],
        })),
      });
    },
    { throws: true },
  );

  bench(
    'batch of 100 statements',
    () => {
      service.batch({
        statements: Array.from({ length: 100 }, (_, i) => ({
          sql: 'SELECT id FROM bench_items WHERE id = ?',
          params: [(i % 1000) + 1],
        })),
      });
    },
    { throws: true },
  );

  bench(
    'statement-split check on 4 KB SQL',
    () => {
      service.query({
        sql: `SELECT '${'x'.repeat(4096)}'`,
        params: [],
      });
    },
    { throws: true },
  );
});
