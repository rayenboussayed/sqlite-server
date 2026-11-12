import { Injectable } from '@nestjs/common';
import { Database } from '../../database.js';
import { environment } from '../../environment.js';
import type { DequeueType, EnqueueType, IdsType } from './schema.js';

/** A job is claimable when its delay elapsed and it is not leased. */
const VISIBLE = 'delay_until <= ? AND (in_flight = 0 OR visible_until <= ?)';

function placeholders(count: number) {
  return Array.from({ length: count }, () => '?').join(', ');
}

@Injectable()
export class QueueService {
  private readonly database = Database.new(environment.QUEUE_STORAGE_PATH);

  constructor() {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payload TEXT NOT NULL,
        delay_until INTEGER NOT NULL DEFAULT 0,
        visible_until INTEGER NOT NULL DEFAULT 0,
        in_flight INTEGER NOT NULL DEFAULT 0
      )
    `);
    this.database.exec(
      'CREATE INDEX IF NOT EXISTS jobs_claimable_idx ON jobs (delay_until, in_flight, visible_until)',
    );
  }

  enqueue({ jobs }: EnqueueType) {
    const now = Date.now();
    const insert = this.database.prepare(
      'INSERT INTO jobs (payload, delay_until) VALUES (?, ?)',
    );

    const ids = this.transaction(() =>
      jobs.map(({ payload, delayMs }) => {
        const result = insert.run(JSON.stringify(payload), now + delayMs);
        return Number(result.lastInsertRowid);
      }),
    );

    return { ids };
  }

  dequeue({ limit, visibilityMs }: DequeueType) {
    const now = Date.now();
    const rows = this.database
      .prepare(`
        UPDATE jobs
        SET in_flight = 1, visible_until = ?
        WHERE id IN (
          SELECT id FROM jobs WHERE ${VISIBLE} ORDER BY id LIMIT ?
        )
        RETURNING id, payload
      `)
      .all(now + visibilityMs, now, now, limit);

    return {
      jobs: rows
        .map((row) => ({
          id: Number(row.id),
          payload: JSON.parse(String(row.payload)),
        }))
        .sort((left, right) => left.id - right.id),
    };
  }

  ack({ ids }: IdsType) {
    const acked = this.transaction(() => {
      const statement = this.database.prepare(
        `DELETE FROM jobs WHERE in_flight = 1 AND id IN (${placeholders(ids.length)})`,
      );
      return Number(statement.run(...ids).changes);
    });

    return { acked };
  }

  nack({ ids }: IdsType) {
    const released = this.transaction(() => {
      const statement = this.database.prepare(
        `UPDATE jobs SET in_flight = 0, visible_until = 0 WHERE in_flight = 1 AND id IN (${placeholders(ids.length)})`,
      );
      return Number(statement.run(...ids).changes);
    });

    return { released };
  }

  size() {
    const now = Date.now();
    const row = this.database
      .prepare(`SELECT count(*) AS pending FROM jobs WHERE ${VISIBLE}`)
      .get(now, now);

    return { pending: Number(row?.pending ?? 0) };
  }

  private transaction<T>(work: () => T) {
    // The connection authorizer denies SQLITE_TRANSACTION by default;
    // withTransactionControl grants it just for this BEGIN…COMMIT.
    this.database.withTransactionControl(() => this.database.exec('BEGIN'));
    try {
      const result = work();
      this.database.withTransactionControl(() => this.database.exec('COMMIT'));
      return result;
    } catch (error) {
      try {
        this.database.withTransactionControl(() =>
          this.database.exec('ROLLBACK'),
        );
      } catch {
        // Already aborted by SQLite; keep the original error.
      }
      throw error;
    }
  }
}
