import { DatabaseSync, constants } from 'node:sqlite';
import { environment } from './environment.js';
import * as sqliteVec from 'sqlite-vec';

/**
 * Application database handle.
 *
 * Wraps `node:sqlite`'s `DatabaseSync` with the server's opinionated
 * defaults: a 5s busy timeout, WAL journaling for writable file-backed
 * databases, `ATTACH`/`DETACH` denied (this server serves a single
 * database), transaction control allowed only inside `withTransactionControl()`
 * (used by `/db/batch` and the queue for their own transaction lifecycle),
 * and optional extension loading (`DATABASE_EXTENSIONS`).
 *
 * `Database.new()` memoizes one instance per file path so services
 * sharing a path share the connection; `:memory:` connections are private.
 */
export class Database extends DatabaseSync {
  private static readonly __instances = new Map<string, Database>();

  /**
   * When false (the default), any statement that begins/commits a
   * transaction is denied by the authorizer. Callers in legitimate
   * transactions (see {@link withTransactionControl}) flip it temporarily.
   */
  public allowTransactionControl = false;

  /** Runs `fn` with the authorizer permitting transaction control. */
  withTransactionControl<T>(fn: () => T): T {
    this.allowTransactionControl = true;
    try {
      return fn();
    } finally {
      this.allowTransactionControl = false;
    }
  }

  private constructor(filePath: string) {
    super(filePath, {
      readOnly:
        environment.SQLITE_READ_ONLY &&
        filePath === environment.SQLITE_DATABASE_PATH
          ? true
          : undefined,
      timeout: 5000,
      allowExtension: Boolean(environment.DATABASE_EXTENSIONS?.length),
    });
    this.loadExtensions();
    this.enableWal(filePath);
    this.setAuthorizer((actionCode) => {
      if (
        actionCode === constants.SQLITE_ATTACH ||
        actionCode === constants.SQLITE_DETACH
      )
        return constants.SQLITE_DENY;
      if (
        actionCode === constants.SQLITE_TRANSACTION &&
        !this.allowTransactionControl
      )
        return constants.SQLITE_DENY;
      return constants.SQLITE_OK;
    });
  }

  private loadExtensions() {
    const extensions = environment.DATABASE_EXTENSIONS;
    if (!extensions?.length) {
      this.enableLoadExtension(false);
      return;
    }

    for (const extension of extensions) {
      switch (extension) {
        case 'vector':
          sqliteVec.load(this);
          break;
      }
    }
    this.enableLoadExtension(false);
  }

  private enableWal(filePath: string) {
    if (filePath === ':memory:') return;
    if (environment.SQLITE_READ_ONLY && filePath === environment.SQLITE_DATABASE_PATH)
      return;
    this.exec('PRAGMA journal_mode = WAL');
  }

  static new(filePath = environment.SQLITE_DATABASE_PATH): Database {
    // In-memory databases are private per caller — two `:memory:` connections
    // must never share state (e.g. SQL and queue storage in tests).
    if (filePath === ':memory:') {
      return new Database(filePath);
    }

    const storedValue = Database.__instances.get(filePath);
    if (storedValue) {
      if (!storedValue.isOpen) storedValue.open();
      return storedValue;
    }

    const database = new Database(filePath);
    if (!database.isOpen) database.open();
    Database.__instances.set(filePath, database);
    return database;
  }
}
