import { z } from 'zod';
import { createArraySchema } from '../utils.js';

/** Shared zod schemas for the Keyv-backed resources (kv and cache). */

export const KeySchema = z.string().trim().min(1).max(512);

export const GetSchema = createArraySchema(z.object({ key: KeySchema }));
export type GetType = z.infer<typeof GetSchema>;

export const SetSchema = createArraySchema(
  z.object({
    key: KeySchema,
    value: z.json(),
    /** Per-entry TTL in milliseconds; overrides the instance default (cache: 300s, kv: none). */
    ttl: z.number().int().nonnegative().optional(),
  }),
);
export type SetType = z.infer<typeof SetSchema>;

export const DeleteSchema = createArraySchema(z.object({ key: KeySchema }));
export type DeleteType = z.infer<typeof DeleteSchema>;
