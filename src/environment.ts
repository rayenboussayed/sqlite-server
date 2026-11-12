import { z } from 'zod';
import path from 'node:path';

function generateDefaultDatabasePath(dbName: string) {
  return path.join(process.cwd(), 'database', `${dbName}.sqlite`);
}

const EnvironmentSchema = z.object({
  SQLITE_DATABASE_PATH: z
    .string()
    .trim()
    .min(1)
    .catch(generateDefaultDatabasePath('database')),
  SQLITE_CACHE_PATH: z
    .string()
    .trim()
    .min(1)
    .catch(generateDefaultDatabasePath('cache')),
  SQLITE_KV_PATH: z
    .string()
    .trim()
    .min(1)
    .catch(generateDefaultDatabasePath('kv')),
  QUEUE_STORAGE_PATH: z
    .string()
    .trim()
    .min(1)
    .catch(generateDefaultDatabasePath('queue')),

  DATABASE_EXTENSIONS: z.set(z.enum(['vector'])).optional(),

  // SQLITE_CLOSE_ON_IDLE: z.stringbool().catch(true),
  AUTH_USERNAME: z.string().trim().min(1).optional(),
  AUTH_PASSWORD: z.string().trim().min(1).optional(),
});

export const environment = EnvironmentSchema.parse(process.env);
