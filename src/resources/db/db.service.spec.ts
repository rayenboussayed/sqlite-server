import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
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

  it('maps a runtime statement failure to 400', () => {
    expect(() =>
      service.query({
        sql: 'INSERT INTO missing_table (name) VALUES (?)',
        params: ['x'],
      }),
    ).toThrow(BadRequestException);
  });

  it('maps a statement that fails at execution time to 400', () => {
    service.query({
      sql: 'CREATE TABLE strict_items (id INTEGER PRIMARY KEY, name TEXT NOT NULL)',
      params: [],
    });

    expect(() =>
      service.query({
        sql: 'INSERT INTO strict_items (name) VALUES (?)',
        params: [null],
      }),
    ).toThrow(BadRequestException);
  });

  it('maps unexpected failures to a 500 without leaking internals', () => {
    const spy = vi
      .spyOn(service.database, 'prepare')
      .mockImplementation((() => {
        throw new Error('boom');
      }) as never);

    try {
      expect(() => service.query({ sql: 'SELECT 1', params: [] })).toThrow(
        InternalServerErrorException,
      );
      expect(() => service.query({ sql: 'SELECT 1', params: [] })).toThrow(
        'Unexpected database error.',
      );
    } finally {
      spy.mockRestore();
    }
  });

  it('rejects multiple statements in one call', () => {
    expect(() =>
      service.query({ sql: 'SELECT 1; SELECT 2', params: [] }),
    ).toThrow(BadRequestException);
    expect(() =>
      service.prepareOnly({ sql: 'SELECT 1; SELECT 2' }),
    ).toThrow(BadRequestException);
  });

  it('allows comments around a single statement', () => {
    const trailing = service.query({
      sql: 'SELECT 1 -- trailing',
      params: [],
    }) as QueryRowsResult;
    expect(trailing.rowCount).toBe(1);

    const leading = service.query({
      sql: '-- leading comment\nSELECT 1',
      params: [],
    }) as QueryRowsResult;
    expect(leading.rowCount).toBe(1);

    const terminatedBlock = service.query({
      sql: 'SELECT 1 /* terminated */',
      params: [],
    }) as QueryRowsResult;
    expect(terminatedBlock.rowCount).toBe(1);

    const unterminatedBlock = service.query({
      sql: 'SELECT 1 /* unterminated',
      params: [],
    }) as QueryRowsResult;
    expect(unterminatedBlock.rowCount).toBe(1);
  });

  it('rejects a second statement hidden after a comment', () => {
    expect(() =>
      service.query({ sql: 'SELECT 1; -- smuggled\nSELECT 2', params: [] }),
    ).toThrow(BadRequestException);
  });

  it('does not confuse operators with comment or quote openings', () => {
    const subtraction = service.query({
      sql: 'SELECT 5 - 3 AS diff',
      params: [],
    }) as QueryRowsResult;
    expect(subtraction.rows[0].diff).toBe(2);

    const division = service.query({
      sql: 'SELECT 6 / 3 AS quotient',
      params: [],
    }) as QueryRowsResult;
    expect(division.rows[0].quotient).toBe(2);
  });

  it('handles doubled quotes inside string literals', () => {
    const result = service.query({
      sql: "SELECT 'it''s' AS greeting",
      params: [],
    }) as QueryRowsResult;

    expect(result.rows[0].greeting).toBe("it's");
  });

  it('handles and rejects bracketed identifiers', () => {
    createItemsTable();

    const bracketed = service.query({
      sql: 'SELECT [id] FROM items',
      params: [],
    }) as QueryRowsResult;
    expect(bracketed.rowCount).toBe(0);

    expect(() =>
      service.query({ sql: 'SELECT [id', params: [] }),
    ).toThrow(BadRequestException);
  });

  it('accepts a single statement terminated by a semicolon', () => {
    const result = service.query({
      sql: 'SELECT 1;',
      params: [],
    }) as QueryRowsResult;

    expect(result.rowCount).toBe(1);
  });

  it('fails the batch with 400 when a transaction is already open', () => {
    service.database.withTransactionControl(() =>
      service.database.exec('BEGIN'),
    );

    try {
      expect(() =>
        service.batch({
          statements: [
            { sql: 'CREATE TABLE impossible (id INTEGER)', params: [] },
          ],
        }),
      ).toThrow(BadRequestException);
    } finally {
      service.database.withTransactionControl(() =>
        service.database.exec('ROLLBACK'),
      );
    }
  });
});
