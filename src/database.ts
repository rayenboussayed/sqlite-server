import { withCacheSync } from 'jutilities/cache';
import { DatabaseSync } from 'node:sqlite';
import { sha512 } from './utils.js';
import { environment } from './environment.js';
import { isEmpty } from 'jutilities/is';
import * as sqliteVec from 'sqlite-vec';

export class Database extends DatabaseSync {
  private static readonly __instances = new Map<string, Database>();

  private constructor(...args: ConstructorParameters<typeof DatabaseSync>) {
    super(...args);
    this.loadExtensions();
  }

  private loadExtensions() {
    if (isEmpty(environment.DATABASE_EXTENSIONS)) {
      this.enableLoadExtension(false);
      return;
    }

    this.enableLoadExtension(true);
    for (const extension of environment.DATABASE_EXTENSIONS!) {
      switch (extension) {
        case 'vector':
          sqliteVec.load(this);
          break;
      }
    }
    this.enableLoadExtension(false);
  }

  override prepare(...args: Parameters<DatabaseSync['prepare']>) {
    return withCacheSync(super.prepare.bind(this), {
      generateCacheKey: (options) =>
        sha512(JSON.stringify(options)).toString('base64'),
    })(...args);
  }

  static new(...args: ConstructorParameters<typeof DatabaseSync>) {
    const storeKey = sha512(JSON.stringify(args)).toString('base64');
    const storedValue = Database.__instances.get(storeKey);
    if (storedValue) {
      if (!storedValue.isOpen) storedValue.open();
      return storedValue;
    }

    const database = new Database(...args);
    if (!database.isOpen) database.open();
    Database.__instances.set(storeKey, database);
    return database;
  }
}
