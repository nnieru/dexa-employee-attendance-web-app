import { z } from 'zod';

// The punch takes no input. The server sets the instant, the business date, and every status
// so the strict object refuses any key a client sends. A request with no body is the same empty request.
export const clockInRequestSchema = z.preprocess((value) => value ?? {}, z.strictObject({}));

export type ClockInRequest = z.infer<typeof clockInRequestSchema>;

// The check-in timing that a punch can receive on a working day, or CHECKIN_NOT_REQUIRED on a day off.
export const checkInClassificationSchema = z.enum([
  'EARLY_CHECKIN',
  'ON_TIME_CHECKIN',
  'LATE_CHECKIN',
  'CHECKIN_NOT_REQUIRED',
]);

export type CheckInClassification = z.infer<typeof checkInClassificationSchema>;

// recordedAt is the server instant in UTC with a Z suffix. businessDate is the WIB calendar date the punch counts for.
export const clockInResponseSchema = z.object({
  type: z.literal('IN'),
  recordedAt: z.iso.datetime(),
  businessDate: z.iso.date(),
  classification: checkInClassificationSchema,
});

export type ClockInResponse = z.infer<typeof clockInResponseSchema>;
