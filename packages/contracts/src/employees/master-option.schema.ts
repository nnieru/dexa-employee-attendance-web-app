import { z } from 'zod';

// One row of a master catalog (positions or employee statuses). Inactive rows are included on purpose:
// they still resolve the options that existing profiles reference, and isActive tells
// the HR screens which options may be newly assigned.
export const masterOptionSchema = z.object({
  id: z.uuid(),
  code: z.string().min(1),
  name: z.string().min(1),
  isActive: z.boolean(),
});

export const masterOptionListSchema = z.array(masterOptionSchema);

export type MasterOption = z.infer<typeof masterOptionSchema>;
