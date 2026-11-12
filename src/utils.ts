import { toArray } from 'jutilities/to';
import crypto from 'node:crypto';
import { z } from 'zod';

export function sha512(payload: string | Buffer) {
  return crypto.createHash('sha512').update(payload).digest();
}

export function createArraySchema<T extends z.ZodType>(base: T) {
  return z.union([base, z.array(base)]).transform(toArray);
}
