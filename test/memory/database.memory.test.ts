import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Database } from '../../src/database.js';

/**
 * The `Database.new` memoization cache must return the shared handle for a
 * given file path (so connections aren't duplicated) while `:memory:` handles
 * stay private per call. If either rule ever breaks, the suite fails here.
 */
describe('Database.new memoization', () => {
  const dirs: string[] = [];

  afterEach(() => {
    while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  });

  it('memoizes a file-backed path and never shares :memory: handles', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sqlite-server-memory-'));
    dirs.push(dir);
    const file = join(dir, 'memo.sqlite');

    const first = Database.new(file);
    expect(Database.new(file)).toBe(first);
    first.close();

    const inMemoryA = Database.new(':memory:');
    const inMemoryB = Database.new(':memory:');
    expect(inMemoryA).not.toBe(inMemoryB);
    inMemoryA.close();
    inMemoryB.close();

    // Repeated calls on the same file path must not create new instances.
    for (let i = 0; i < 50; i++) Database.new(file);
    expect(Database.new(file)).toBe(Database.new(file));
  });
});
