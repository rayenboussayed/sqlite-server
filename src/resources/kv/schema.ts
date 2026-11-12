import { z } from 'zod';
import { createArraySchema } from '../../utils.js';

export const GetSchema = createArraySchema(
  z.object({ key: z.coerce.string().trim().min(1) }),
);
export type GetType = z.infer<typeof GetSchema>;

export const SetSchema = createArraySchema(
  z.object({
    key: z.coerce.string().trim().min(1),
    value: z.json(),
  }),
);
export type SetType = z.infer<typeof SetSchema>;

export const DeleteSchema = createArraySchema(
  z.object({ key: z.coerce.string().trim().min(1) }),
);
export type DeleteType = z.infer<typeof DeleteSchema>;
