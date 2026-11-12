import { Injectable } from '@nestjs/common';
import { environment } from '../../environment.js';
import { createSqliteKeyv } from '../../kv.js';
import type { SetType } from '../keyv.schema.js';

/**
 * Cache store with a 5-minute default TTL.
 * A per-entry `ttl` in the Set payload overrides the instance default.
 */
@Injectable()
export class CacheService {
  public readonly storage = createSqliteKeyv({
    uri: environment.SQLITE_CACHE_PATH,
    ttl: 300_000, // default 5 minutes
  });

  /** Values aligned with `keys`; `undefined` for missing or expired keys. */
  get(keys: string[]) {
    return this.storage.getMany(keys);
  }

  /** One success flag per entry, aligned with the input order. */
  set(entries: SetType) {
    return this.storage.setMany(entries);
  }

  /** One success flag per key, aligned with the input order. */
  remove(keys: string[]) {
    return this.storage.deleteMany(keys);
  }
}
