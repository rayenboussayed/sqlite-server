import { Injectable } from '@nestjs/common';
import { environment } from '../../environment.js';
import { createSqliteKeyv } from '../../kv.js';
import type { SetType } from '../keyv.schema.js';

/**
 * Persistent key-value store (no default expiry).
 */
@Injectable()
export class KvService {
  public readonly storage = createSqliteKeyv({
    uri: environment.SQLITE_KV_PATH,
    ttl: 0, // no instance default: entries live until deleted (a per-entry ttl still applies)
  });

  /** Values aligned with `keys`; `undefined` for missing keys. */
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
