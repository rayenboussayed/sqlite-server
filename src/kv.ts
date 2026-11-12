import Keyv from 'keyv';
import KeyvSqlite from '@keyv/sqlite';

/**
 * Creates a Keyv instance backed by a SQLite file (via `@keyv/sqlite`,
 * which auto-detects the built-in `node:sqlite` driver — no native
 * dependencies required).
 *
 * Instances are cheap to create but hold an open connection, so callers
 * should create exactly one per path at module scope (see the kv/cache
 * services) and reuse it for the process lifetime.
 *
 * Note: `KeyvSqlite` is initialized asynchronously; the first operation on
 * a fresh instance awaits schema setup transparently.
 */
export function createSqliteKeyv({ uri, ttl }: { uri: string; ttl: number }) {
  return new Keyv(new KeyvSqlite({ uri }), { ttl });
}
