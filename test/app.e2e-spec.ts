import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

/**
 * HTTP end-to-end tests: every assertion goes through the real HTTP stack
 * (Fastify adapter, global AuthInterceptor, controllers, services, SQLite).
 *
 * Harness notes
 * -------------
 * - `vitest.config.e2e.ts` points all four SQLite paths at `:memory:` and does
 *   not define AUTH_USERNAME/AUTH_PASSWORD. `environment.ts` reads `process.env`
 *   once at import time, so auth is disabled for the whole suite and requests
 *   are sent without `auth-*` headers on purpose. The 401 branch cannot be
 *   exercised here without a second, differently-configured app module.
 * - `Database.new(':memory:')` returns a NEW connection per call (see
 *   `src/database.ts`), so every `beforeEach` app instance starts with empty
 *   databases. Tests do not need cleanup between cases.
 * - The Fastify adapter is passed explicitly: `@nestjs/platform-express` is not
 *   a dependency, and a bare `createNestApplication()` makes Nest try to load
 *   it, log "package is missing" and `process.exit(1)`. `ready()` is required
 *   for Fastify before `supertest` can drive `getHttpServer()`.
 * - `AppModule` registers `StandardSchemaValidationPipe` via `APP_PIPE`, so
 *   `@Body({ schema })` validation (and `createArraySchema`'s single-object →
 *   array normalisation) applies identically here and in production.
 */

describe('sqlite-server (e2e)', () => {
  let app: NestFastifyApplication;

  const api = () => request(app.getHttpServer());

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /health', () => {
    it('reports ok without credentials', async () => {
      const response = await api().get('/health').expect(200);

      expect(response.body).toEqual({ status: 'ok' });
    });
  });

  describe('POST /db/query', () => {
    it('creates a table, inserts with positional params, and selects rows back', async () => {
      await api()
        .post('/db/query')
        .send({
          sql: 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL)',
          params: [],
        })
        .expect(200);

      const insert = await api()
        .post('/db/query')
        .send({ sql: 'INSERT INTO users (name) VALUES (?)', params: ['Ada'] })
        .expect(200);

      expect(insert.body).toMatchObject({ changes: 1, lastInsertRowid: 1 });

      const select = await api()
        .post('/db/query')
        .send({
          sql: 'SELECT id, name FROM users ORDER BY id',
          params: [],
        })
        .expect(200);

      expect(select.body.rowCount).toBe(1);
      expect(select.body.rows).toEqual([{ id: 1, name: 'Ada' }]);
      expect(
        select.body.columns.map((column: { name: string }) => column.name),
      ).toEqual(['id', 'name']);
    });

    it('coerces boolean bind params to SQLite integers', async () => {
      await api()
        .post('/db/query')
        .send({
          sql: 'CREATE TABLE flags (id INTEGER PRIMARY KEY, enabled INTEGER NOT NULL)',
          params: [],
        })
        .expect(200);

      await api()
        .post('/db/query')
        .send({
          sql: 'INSERT INTO flags (enabled) VALUES (?)',
          params: [true],
        })
        .expect(200);

      await api()
        .post('/db/query')
        .send({
          sql: 'INSERT INTO flags (enabled) VALUES (?)',
          params: [false],
        })
        .expect(200);

      const select = await api()
        .post('/db/query')
        .send({ sql: 'SELECT enabled FROM flags ORDER BY id', params: [] })
        .expect(200);

      expect(select.body.rows).toEqual([{ enabled: 1 }, { enabled: 0 }]);
    });

    it('reports changes for UPDATE and DELETE', async () => {
      await api()
        .post('/db/query')
        .send({
          sql: 'CREATE TABLE items (id INTEGER PRIMARY KEY, label TEXT NOT NULL)',
          params: [],
        })
        .expect(200);

      await api()
        .post('/db/query')
        .send({
          sql: 'INSERT INTO items (label) VALUES (?)',
          params: ['first'],
        })
        .expect(200);

      const update = await api()
        .post('/db/query')
        .send({
          sql: 'UPDATE items SET label = ? WHERE id = ?',
          params: ['second', 1],
        })
        .expect(200);

      expect(update.body.changes).toBe(1);

      const updated = await api()
        .post('/db/query')
        .send({ sql: 'SELECT label FROM items WHERE id = 1', params: [] })
        .expect(200);

      expect(updated.body.rows).toEqual([{ label: 'second' }]);

      const deleted = await api()
        .post('/db/query')
        .send({ sql: 'DELETE FROM items WHERE id = ?', params: [1] })
        .expect(200);

      expect(deleted.body.changes).toBe(1);

      const empty = await api()
        .post('/db/query')
        .send({ sql: 'SELECT label FROM items', params: [] })
        .expect(200);

      expect(empty.body.rowCount).toBe(0);
      expect(empty.body.rows).toEqual([]);
    });

    it('rejects syntactically invalid SQL with 400', async () => {
      const response = await api()
        .post('/db/query')
        .send({ sql: 'SELEC 1', params: [] })
        .expect(400);

      expect(response.body.message).toBeTruthy();
    });

    it('rejects client-driven transaction control with 400', async () => {
      const response = await api()
        .post('/db/query')
        .send({ sql: '-- hi\nBEGIN', params: [] })
        .expect(400);

      // The connection authorizer (not a string regex) denies it.
      expect(response.body.message).toMatch(/not authorized/i);
    });

    it('never lets a batched statement COMMIT early — rollback is total', async () => {
      await api()
        .post('/db/batch')
        .send({
          statements: [
            {
              sql: 'CREATE TABLE smuggle_items (id INTEGER PRIMARY KEY, label TEXT NOT NULL)',
              params: [],
            },
            { sql: 'INSERT INTO smuggle_items (label) VALUES (?)', params: ['draft'] },
            { sql: '/* comment */ COMMIT', params: [] },
            { sql: 'INSERT INTO smuggle_items (label) VALUES (?)', params: ['smuggled'] },
          ],
        })
        .expect(400);

      // The CREATE TABLE itself must have rolled back: the table cannot exist.
      await api()
        .post('/db/query')
        .send({ sql: 'SELECT COUNT(*) AS count FROM smuggle_items', params: [] })
        .expect(400);
    });

    it('rejects multi-statement input instead of silently truncating', async () => {
      const response = await api()
        .post('/db/query')
        .send({ sql: 'SELECT 1 AS a; SELECT 2 AS b', params: [] })
        .expect(400);

      expect(response.body.message).toMatch(/multiple statements/i);
    });
  });

  describe('POST /db/batch', () => {
    it('runs every statement and commits them together', async () => {
      const response = await api()
        .post('/db/batch')
        .send({
          statements: [
            {
              sql: 'CREATE TABLE batch_items (id INTEGER PRIMARY KEY, label TEXT NOT NULL)',
              params: [],
            },
            {
              sql: 'INSERT INTO batch_items (label) VALUES (?)',
              params: ['one'],
            },
            {
              sql: 'INSERT INTO batch_items (label) VALUES (?)',
              params: ['two'],
            },
            {
              sql: 'SELECT label FROM batch_items ORDER BY id',
              params: [],
            },
          ],
        })
        .expect(200);

      expect(response.body.results).toHaveLength(4);
      expect(response.body.results[3].rowCount).toBe(2);
      expect(response.body.results[3].rows).toEqual([
        { label: 'one' },
        { label: 'two' },
      ]);

      const persisted = await api()
        .post('/db/query')
        .send({
          sql: 'SELECT count(*) AS total FROM batch_items',
          params: [],
        })
        .expect(200);

      expect(persisted.body.rows).toEqual([{ total: 2 }]);
    });

    it('rolls back the whole batch when a statement fails', async () => {
      await api()
        .post('/db/query')
        .send({
          sql: 'CREATE TABLE atomic_items (id INTEGER PRIMARY KEY, label TEXT NOT NULL)',
          params: [],
        })
        .expect(200);

      await api()
        .post('/db/batch')
        .send({
          statements: [
            {
              sql: 'INSERT INTO atomic_items (label) VALUES (?)',
              params: ['must not survive'],
            },
            {
              sql: 'INSERT INTO table_that_does_not_exist (x) VALUES (1)',
              params: [],
            },
          ],
        })
        .expect(400);

      const persisted = await api()
        .post('/db/query')
        .send({
          sql: 'SELECT count(*) AS total FROM atomic_items',
          params: [],
        })
        .expect(200);

      expect(persisted.body.rows).toEqual([{ total: 0 }]);
    });
  });

  describe('POST /db/prepare', () => {
    it('validates SQL and reports the columns it would return', async () => {
      const response = await api()
        .post('/db/prepare')
        .send({ sql: 'SELECT 1 AS answer' })
        .expect(200);

      expect(response.body.sql).toBe('SELECT 1 AS answer');
      expect(
        response.body.columns.map((column: { name: string }) => column.name),
      ).toEqual(['answer']);
      expect(response.body.columns[0].type).toBeNull();
    });

    it('rejects SQL that cannot be prepared with 400', async () => {
      await api()
        .post('/db/prepare')
        .send({ sql: 'SELECT * FROM table_that_does_not_exist' })
        .expect(400);
    });
  });

  describe('KV store', () => {
    it('accepts a single-object payload and reads the value back', async () => {
      const set = await api()
        .post('/kv/set')
        .send({ key: 'greeting', value: { hello: 'world' } })
        .expect(200);

      expect(set.body).toEqual({ results: [true] });

      const get = await api()
        .post('/kv/get')
        .send([{ key: 'greeting' }])
        .expect(200);

      expect(get.body).toEqual({ values: [{ hello: 'world' }] });
    });

    it('sets several entries, deletes one, and reads missing keys as null', async () => {
      const set = await api()
        .post('/kv/set')
        .send([
          { key: 'alpha', value: 1 },
          { key: 'beta', value: 2 },
        ])
        .expect(200);

      expect(set.body).toEqual({ results: [true, true] });

      const removed = await api()
        .post('/kv/delete')
        .send({ key: 'alpha' })
        .expect(200);

      expect(removed.body).toEqual({ results: [true] });

      const get = await api()
        .post('/kv/get')
        .send([{ key: 'alpha' }, { key: 'beta' }])
        .expect(200);

      // `undefined` from Keyv is serialised as `null` by JSON.stringify.
      expect(get.body).toEqual({ values: [null, 2] });
    });
  });

  describe('cache store', () => {
    it('expires an entry according to its per-entry ttl', async () => {
      const set = await api()
        .post('/cache/set')
        .send({ key: 'ephemeral', value: 'soon gone', ttl: 100 })
        .expect(200);

      expect(set.body).toEqual({ results: [true] });

      const hit = await api()
        .post('/cache/get')
        .send([{ key: 'ephemeral' }])
        .expect(200);

      expect(hit.body).toEqual({ values: ['soon gone'] });

      await new Promise((resolve) => setTimeout(resolve, 200));

      const miss = await api()
        .post('/cache/get')
        .send([{ key: 'ephemeral' }])
        .expect(200);

      expect(miss.body).toEqual({ values: [null] });
    });
  });

  describe('queue', () => {
    it('enqueues, dequeues, acknowledges, and reports the pending size', async () => {
      const enqueued = await api()
        .post('/queue/enqueue')
        .send({ jobs: [{ payload: { hello: 'world' } }] })
        .expect(200);

      expect(enqueued.body.ids).toHaveLength(1);
      const [jobId] = enqueued.body.ids;
      expect(typeof jobId).toBe('number');

      await api().get('/queue/size').expect(200).expect({ pending: 1 });

      // Empty body: `DequeueSchema` prefaults to its default limits.
      const dequeued = await api().post('/queue/dequeue').send().expect(200);

      expect(dequeued.body.jobs).toHaveLength(1);
      expect(dequeued.body.jobs[0]).toEqual({
        id: jobId,
        payload: { hello: 'world' },
      });

      await api()
        .post('/queue/ack')
        .send({ ids: [jobId] })
        .expect(200)
        .expect({ acked: 1 });

      await api().get('/queue/size').expect(200).expect({ pending: 0 });
    });

    it('releases a claimed job back to pending with nack', async () => {
      const enqueued = await api()
        .post('/queue/enqueue')
        .send({ jobs: [{ payload: 'retry me' }] })
        .expect(200);

      const [jobId] = enqueued.body.ids;

      const dequeued = await api().post('/queue/dequeue').send().expect(200);
      expect(dequeued.body.jobs).toHaveLength(1);

      await api()
        .post('/queue/nack')
        .send({ ids: [jobId] })
        .expect(200)
        .expect({ released: 1 });

      await api().get('/queue/size').expect(200).expect({ pending: 1 });
    });
  });

  describe('request validation', () => {
    it('rejects bodies that do not match the endpoint schema', async () => {
      // Nest's StandardSchemaValidationPipe answers 400; 422 is allowed here so
      // the assertion survives a custom exception factory.
      const missingIds = await api().post('/queue/ack').send({});
      expect([400, 422]).toContain(missingIds.status);

      const missingSql = await api().post('/db/query').send({});
      expect([400, 422]).toContain(missingSql.status);
    });
  });
});
