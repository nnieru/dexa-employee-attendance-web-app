import { z } from 'zod';

// A plain string rather than ErrorCode, so clients can still parse codes that newer servers add.
export const errorResponseSchema = z.object({
  statusCode: z.number().int(),
  code: z.string().min(1),
  message: z.string(),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
