import { z } from 'zod';

// Like clock-in, the punch takes no input. The server sets the instant, the business date, and every status (ATT-3,
// DATABASE §5.5), so the strict object refuses any key a client sends. A request with no body is the same empty request.
export const clockOutRequestSchema = z.preprocess((value) => value ?? {}, z.strictObject({}));

export type ClockOutRequest = z.infer<typeof clockOutRequestSchema>;

// The check-out timing that a punch can receive on a working day, or CHECKOUT_NOT_REQUIRED on a day off (ATT-7).
export const checkOutClassificationSchema = z.enum([
  'EARLY_CHECKOUT',
  'ON_TIME_CHECKOUT',
  'LATE_CHECKOUT',
  'CHECKOUT_NOT_REQUIRED',
]);

export type CheckOutClassification = z.infer<typeof checkOutClassificationSchema>;

// recordedAt is the server instant in UTC with a Z suffix. businessDate is the WIB calendar date the punch counts for.
export const clockOutResponseSchema = z.object({
  type: z.literal('OUT'),
  recordedAt: z.iso.datetime(),
  businessDate: z.iso.date(),
  classification: checkOutClassificationSchema,
});

export type ClockOutResponse = z.infer<typeof clockOutResponseSchema>;
