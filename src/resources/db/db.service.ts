import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { Database } from '../../database.js';
import type {
  BatchResult,
  BatchType,
  PrepareResult,
  PrepareType,
  QueryResult,
  QueryType,
  ResultColumn,
} from './db.schema.js';

/**
 * Thin SQL surface over the shared `Database` handle.
 *
 * Everything here is synchronous (`node:sqlite` is a synchronous API), which
 * also means a batch runs atomically without any other request interleaving,
 * since Node's event loop cannot preempt it mid-transaction.
 *
 * Transaction control (`BEGIN`/`COMMIT`/…) is denied by the connection
 * authorizer everywhere except inside `/db/batch`, which owns the only
 * legitimate transaction lifecycle.
 */
@Injectable()
export class DbService {
  public readonly database = Database.new();

  /** Execute a single statement, inferring the result shape from its columns. */
  query({ sql, params }: QueryType): QueryResult {
    const statement = this.prepareStatement(sql);

    try {
      // A statement that reports no columns cannot return rows; everything
      // else (SELECT, RETURNING, some PRAGMA) is read back with all().
      const columns = statement.columns();

      if (columns.length === 0) {
        // Not a row-returning statement: use run() so changes/lastInsertRowid
        // are populated (all() would discard them).
        const { changes, lastInsertRowid } = statement.run(
          ...this.bindParams(params),
        );
        return {
          sql,
          changes: Number(changes),
          lastInsertRowid: Number(lastInsertRowid),
        };
      }

      const rows = statement.all(...this.bindParams(params));
      return {
        sql,
        columns: this.projectColumns(columns),
        rows,
        rowCount: rows.length,
      };
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  /** Validate SQL without executing it, reporting the columns it would return. */
  prepareOnly({ sql }: PrepareType): PrepareResult {
    const statement = this.prepareStatement(sql);
    return { sql, columns: this.projectColumns(statement.columns()) };
  }

  /** Run several statements atomically: all commit, or none do. */
  batch({ statements }: BatchType): BatchResult {
    const db = this.database;

    // The authorizer permits transaction control only inside withTransactionControl(),
    // i.e. solely for the batch's own BEGIN/COMMIT/ROLLBACK — the statements
    // themselves run with transaction control denied, so a smuggled COMMIT
    // can never end the transaction early.
    try {
      this.database.withTransactionControl(() => db.exec('BEGIN IMMEDIATE'));
    } catch (error) {
      // Nothing was started, so there is nothing to roll back.
      throw this.toHttpError(error);
    }

    const results: QueryResult[] = [];

    try {
      for (const statement of statements) {
        results.push(this.query(statement));
      }
      this.database.withTransactionControl(() => db.exec('COMMIT'));
    } catch (error) {
      this.rollback();
      throw this.toHttpError(error);
    }

    return { results };
  }

  private rollback(): void {
    try {
      this.database.withTransactionControl(() =>
        this.database.exec('ROLLBACK'),
      );
    } catch {
      // SQLite may have already aborted the transaction on a fatal error;
      // never let the rollback failure hide the original one.
    }
  }

  private prepareStatement(sql: string) {
    // node:sqlite prepares only the first statement; reject input with more
    // than one so callers cannot smuggle a second statement past validation.
    if (hasMultipleStatements(sql)) {
      throw new BadRequestException(
        'Multiple statements are not allowed; use POST /db/batch.',
      );
    }
    try {
      return this.database.prepare(sql);
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  /** SQLite bindables after normalisation; anonymous `?` placeholders only. */
  private bindParams(params: QueryType['params']): (string | number | null)[] {
    return params.map((param) =>
      typeof param === 'boolean' ? (param ? 1 : 0) : param,
    );
  }

  private projectColumns(
    columns: { name: string; type: string | null }[],
  ): ResultColumn[] {
    return columns.map(({ name, type }) => ({ name, type }));
  }

  /**
   * Maps an arbitrary failure to an HTTP exception: SQLite client faults
   * (code ERR_SQLITE_ERROR, e.g. syntax errors, constraint violations,
   * authorizer denials, bad binds) become 400s; anything else is a server
   * error, and already-mapped HTTP exceptions pass through untouched.
   */
  private toHttpError(error: unknown): Error {
    if (error instanceof HttpException) return error;

    if (
      error instanceof Error &&
      (error as NodeJS.ErrnoException).code === 'ERR_SQLITE_ERROR'
    )
      return new BadRequestException(error.message);

    return new InternalServerErrorException('Unexpected database error.');
  }
}

/**
 * Detects more than one statement by stripping string literals, quoted
 * identifiers, and comments, then looking for a `;` that is not at the very
 * end. Known limitation: semicolons inside `CREATE TRIGGER … BEGIN … END`
 * bodies are rejected too — triggers are not supported via this endpoint.
 */
function hasMultipleStatements(sql: string): boolean {
  const stripped = stripLiteralsAndComments(sql).trim();
  return /;(?!\s*$)/.test(stripped);
}

function stripLiteralsAndComments(sql: string): string {
  let out = '';
  let i = 0;
  const n = sql.length;

  while (i < n) {
    const ch = sql[i];

    if (ch === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i);
      out += ' ';
      i = end === -1 ? n : end + 1;
      continue;
    }

    if (ch === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      out += ' ';
      i = end === -1 ? n : end + 2;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      i++;
      while (i < n) {
        if (sql[i] === quote) {
          // Doubled quote inside a string literal is an escaped quote.
          if (sql[i + 1] === quote) {
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      out += ' ';
      continue;
    }

    if (ch === '[') {
      const end = sql.indexOf(']', i);
      out += ' ';
      i = end === -1 ? n : end + 1;
      continue;
    }

    out += ch;
    i++;
  }

  return out;
}
