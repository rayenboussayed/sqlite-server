import { z } from 'zod';

export const QueuePayloadSchema = z.json();

export const EnqueueSchema = z.object({
  jobs: z
    .array(
      z.object({
        payload: QueuePayloadSchema,
        delayMs: z.number().int().nonnegative().default(0),
      }),
    )
    .min(1)
    .max(100),
});
export type EnqueueType = z.infer<typeof EnqueueSchema>;

// `.prefault({})` so POST /queue/dequeue with an empty body uses the limits below.
export const DequeueSchema = z
  .object({
    limit: z.number().int().min(1).max(100).default(1),
    visibilityMs: z.number().int().nonnegative().default(30_000),
  })
  .prefault({});
export type DequeueType = z.infer<typeof DequeueSchema>;

export const IdsSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(100),
});
export type IdsType = z.infer<typeof IdsSchema>;
