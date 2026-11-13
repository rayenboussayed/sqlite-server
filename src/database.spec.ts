import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Database } from './database.js';
import { environment } from './environment.js';

/**
 * Exercises the paths the in-memory test suite never reaches: file-backed
 * connections (WAL mode), the path-memoisation cache, read-only mode, and
 * extension loading. Each file lives in a unique temp dir, removed afterwards.
 */
describe('Database (file-backed)', () => {
  const tempDirs: string[] = [];
  const originalReadOnly = environment.SQLITE_READ_ONLY;
  const originalDatabasePath = environment.SQLITE_DATABASE_PATH;
  const originalExtensions = environment.DATABASE_EXTENSIONS;

  const tempFile = (name = 'test.sqlite') => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlite-server-db-'));
    tempDirs.push(dir);
    return path.join(dir, name);
  };

  afterEach(() => {
    environment.SQLITE_READ_ONLY = originalReadOnly;
    environment.SQLITE_DATABASE_PATH = originalDatabasePath;
    environment.DATABASE_EXTENSIONS = originalExtensions;
  });

  afterAll(() => {
    for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('enables WAL journaling on file-backed databases', () => {
    const db = Database.new(tempFile());

    expect(db.prepare('PRAGMA journal_mode').get()).toEqual({
      journal_mode: 'wal',
    });
  });

  it('memoizes file-backed instances per path', () => {
    const file = tempFile();

    const first = Database.new(file);

    expect(Database.new(file)).toBe(first);
  });

  it('reopens a memoized instance that was closed', () => {
    const file = tempFile();
    const first = Database.new(file);

    first.close();

    const reopened = Database.new(file);

    expect(reopened).toBe(first);
    expect(reopened.isOpen).toBe(true);
  });

  it('opens the configured SQLITE_DATABASE_PATH read-only in read-only mode', () => {
    const file = tempFile();
    fs.writeFileSync(file, ''); // read-only connections cannot create it
    environment.SQLITE_READ_ONLY = true;
    environment.SQLITE_DATABASE_PATH = file;

    const db = Database.new(file);

    expect(() => db.exec('CREATE TABLE t (id INTEGER)')).toThrow();
  });

  it('opens other paths read-write even in read-only mode', () => {
    environment.SQLITE_READ_ONLY = true;
    environment.SQLITE_DATABASE_PATH = tempFile('other.sqlite');

    const db = Database.new(tempFile());

    expect(() => db.exec('CREATE TABLE t (id INTEGER)')).not.toThrow();
  });

  it('loads the vector extension when configured', () => {
    environment.DATABASE_EXTENSIONS = ['vector'];

    const db = Database.new(tempFile());

    const { v } = db.prepare('SELECT vec_version() AS v').get() as {
      v: string;
    };
    expect(v).toMatch(/^v/);
  });

  it('ignores extension names with no matching loader', () => {
    // Unreachable through env parsing (zod restricts values to 'vector'),
    // but must not break connection setup either.
    environment.DATABASE_EXTENSIONS = ['bogus'] as unknown as ['vector'];

    const db = Database.new(tempFile());

    expect(db.prepare('SELECT 1 AS ok').get()).toEqual({ ok: 1 });
  });
});
