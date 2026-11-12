import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DbService } from './db.service.js';
import type { QueryChangesResult, QueryRowsResult } from './db.schema.js';

describe('DbService', () => {
  let service: DbService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DbService],
    }).compile();

    service = module.get<DbService>(DbService);
  });

  function createItemsTable() {
    service.query({
      sql: 'CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT NOT NULL)',
      params: [],
    });
  }

  it('reports changes and lastInsertRowid for parameterised INSERT', () => {
    createItemsTable();

    const inserted = service.query({
      sql: 'INSERT INTO items (name) VALUES (?)',
      params: ['first'],
    }) as QueryChangesResult;

    expect(inserted.changes).toBe(1);
    expect(inserted.lastInsertRowid).toBe(1);
  });

  it('returns rows, columns and rowCount for SELECT', () => {
    createItemsTable();
    service.query({
      sql: 'INSERT INTO items (name) VALUES (?)',
      params: ['first'],
    });
    service.query({
      sql: 'INSERT INTO items (name) VALUES (?)',
      params: ['second'],
    });

    const selected = service.query({
      sql: 'SELECT id, name FROM items ORDER BY id',
      params: [],
    }) as QueryRowsResult;

    expect(selected.rowCount).toBe(2);
    expect(selected.columns.map((column) => column.name)).toEqual([
      'id',
      'name',
    ]);
    expect(selected.rows.map((row) => row.name)).toEqual(['first', 'second']);
  });

  it('coerces boolean params to SQLite integers', () => {
    service.query({
      sql: 'CREATE TABLE flags (value INTEGER NOT NULL)',
      params: [],
    });
    service.query({
      sql: 'INSERT INTO flags (value) VALUES (?)',
      params: [true],
    });
    service.query({
      sql: 'INSERT INTO flags (value) VALUES (?)',
      params: [false],
    });

    const selected = service.query({
      sql: 'SELECT value FROM flags ORDER BY rowid',
      params: [],
    }) as QueryRowsResult;

    expect(selected.rows[0].value).toBe(1);
    expect(selected.rows[1].value).toBe(0);
  });

  it('rejects invalid SQL on query and prepareOnly', () => {
    expect(() =>
      service.query({ sql: 'SELEC 1', params: [] }),
    ).toThrow(BadRequestException);

    expect(() => service.prepareOnly({ sql: 'SELEC 1' })).toThrow(
      BadRequestException,
    );
  });

  it('rejects transaction control SQL outside /db/batch', () => {
    expect(() => service.query({ sql: 'BEGIN', params: [] })).toThrow(
      BadRequestException,
    );
  });

  it('rejects ATTACH', () => {
    expect(() =>
      service.query({ sql: "ATTACH DATABASE ':memory:' AS extra", params: [] }),
    ).toThrow(BadRequestException);
  });

  it('returns one result per statement in a batch', () => {
    const result = service.batch({
      statements: [
        {
          sql: 'CREATE TABLE batch_items (id INTEGER PRIMARY KEY, name TEXT NOT NULL)',
          params: [],
        },
        { sql: 'INSERT INTO batch_items (name) VALUES (?)', params: ['a'] },
        { sql: 'INSERT INTO batch_items (name) VALUES (?)', params: ['b'] },
        { sql: 'SELECT name FROM batch_items ORDER BY id', params: [] },
      ],
    });

    expect(result.results).toHaveLength(4);

    const selected = result.results[3] as QueryRowsResult;
    expect(selected.rowCount).toBe(2);
    expect(selected.rows.map((row) => row.name)).toEqual(['a', 'b']);
  });

  it('rolls back earlier statements when a batch statement fails', () => {
    service.query({
      sql: 'CREATE TABLE rolled_back (id INTEGER PRIMARY KEY, name TEXT NOT NULL)',
      params: [],
    });

    expect(() =>
      service.batch({
        statements: [
          {
            sql: 'INSERT INTO rolled_back (name) VALUES (?)',
            params: ['should disappear'],
          },
          {
            sql: 'INSERT INTO missing_table (name) VALUES (?)',
            params: ['boom'],
          },
        ],
      }),
    ).toThrow(BadRequestException);

    const remaining = service.query({
      sql: 'SELECT count(*) AS count FROM rolled_back',
      params: [],
    }) as QueryRowsResult;

    expect(remaining.rows[0].count).toBe(0);
  });
});
