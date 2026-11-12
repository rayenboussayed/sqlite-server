import { z } from 'zod';
import path from 'node:path';
import fs from 'node:fs';

function defaultDatabasePath(dbName: string) {
  return path.join(process.cwd(), 'database', `${dbName}.sqlite`);
}

function ensureParentDirectory(filePath: string) {
  // The ':memory:' sentinel has no parent directory; skip filesystem side effects.
  if (filePath === ':memory:') return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

const databasePath = (name: string) =>
  z
    .string()
    .trim()
    .min(1)
    .catch(defaultDatabasePath(name));

const EnvironmentSchema = z.object({
  SQLITE_DATABASE_PATH: databasePath('database'),
  SQLITE_CACHE_PATH: databasePath('cache'),
  SQLITE_KV_PATH: databasePath('kv'),
  QUEUE_STORAGE_PATH: databasePath('queue'),

  // Comma-separated list of SQLite extensions to load. Only 'vector' is supported.
  DATABASE_EXTENSIONS: z
    .string()
    .trim()
    .transform((value) =>
      value
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.enum(['vector'])))
    .optional(),

  SQLITE_READ_ONLY: z.stringbool().catch(false),

  AUTH_USERNAME: z.string().trim().min(1).optional(),
  AUTH_PASSWORD: z.string().trim().min(1).optional(),

  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
});

export const environment = EnvironmentSchema.parse(process.env);

for (const filePath of [
  environment.SQLITE_DATABASE_PATH,
  environment.SQLITE_CACHE_PATH,
  environment.SQLITE_KV_PATH,
  environment.QUEUE_STORAGE_PATH,
]) {
  ensureParentDirectory(filePath);
}
