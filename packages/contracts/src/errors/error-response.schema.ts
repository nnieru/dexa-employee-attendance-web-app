import { z } from 'zod';

// A plain string rather than ErrorCode, so clients can still parse codes that newer servers add.
// details is optional and added only by failures that carry facts a client acts on (for example the
// operation ID of a partial provisioning failure). Responses without it keep the three base fields.
export const errorResponseSchema = z.object({
  statusCode: z.number().int(),
  code: z.string().min(1),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
