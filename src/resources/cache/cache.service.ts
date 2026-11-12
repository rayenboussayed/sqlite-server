import { Injectable } from '@nestjs/common';
import { createSqliteKeyv } from '../../kv.js';
import { environment } from '../../environment.js';

@Injectable()
export class CacheService {
  public readonly storage = createSqliteKeyv({
    uri: environment.SQLITE_CACHE_PATH,
    ttl: 300_000, // default 5 minutes
  });
}
