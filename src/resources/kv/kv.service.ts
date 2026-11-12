import { Injectable } from '@nestjs/common';
import { environment } from '../../environment.js';
import { createSqliteKeyv } from '../../kv.js';
import { GetType, SetType } from './schema.js';

@Injectable()
export class KvService {
  public readonly storage = createSqliteKeyv({
    uri: environment.SQLITE_KV_PATH,
    ttl: 0, // disable ttl, like kv storage
  });

  _get(payload: GetType) {
    return this.storage.getMany(payload.flatMap((d) => d.key));
  }

  _set(payload: SetType) {
    const isFailed = this.storage.setMany(payload)
    
  }
}
