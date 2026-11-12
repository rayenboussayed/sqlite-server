import Keyv from 'keyv';
import KeyvSqlite from '@keyv/sqlite';
import { lazy } from 'jutilities/lazy';
import { withCacheAsync } from 'jutilities/cache';
import { sha512 } from './utils.js';

class KeyValue extends Keyv {


  setMany<Value = any>(entries: KeyvEntry<Value>[]): Promise<boolean[]> {
    return withCacheAsync(super.setMany.bind(this), { generateCacheKey(options) {
      return sha512()
    }, })
  }
}


export const createSqliteKeyv = lazy(
  (options: {uri: string, ttl?:number}) => new Keyv(new KeyvSqlite(options), options),
);
