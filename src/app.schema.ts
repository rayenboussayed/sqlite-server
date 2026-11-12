import { z } from 'zod';

export const QuerySchema = z.object({
  text: z.string().trim().min(1),
  values: z.array(z.any()),
  prepare: z.boolean().default(true),
});
export type QueryType = z.infer<typeof QuerySchema>

export const PrepareSchema = z.object({
  query: z.string().trim().min(1),
});
export type PrepareType = z.infer<typeof PrepareSchema>