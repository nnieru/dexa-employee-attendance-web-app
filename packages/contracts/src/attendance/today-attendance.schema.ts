import { z } from 'zod';
import { checkInClassificationSchema } from './clock-in.schema.js';
import { checkOutClassificationSchema } from './clock-out.schema.js';

// The state of the employee's day as the punch screen shows it (PRD ATT-6). The status discriminates the union:
// before the first punch, after it, and after the check-out. The times are the effective times (PRD SUM-6).
export const todayStateSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('NOT_CLOCKED_IN') }),
  z.object({
    status: z.literal('CLOCKED_IN'),
    clockInAt: z.iso.datetime(),
    clockInStatus: checkInClassificationSchema,
  }),
  z.object({
    status: z.literal('DONE'),
    clockInAt: z.iso.datetime(),
    clockInStatus: checkInClassificationSchema,
    clockOutAt: z.iso.datetime(),
    clockOutStatus: checkOutClassificationSchema,
  }),
]);

export type TodayAttendanceState = z.infer<typeof todayStateSchema>;

// The schedule fields are discriminated on isWorkingDay: a day off carries no scheduled instants (ATT-7, SCH-7).
// Grace values are not part of this response, so employees see no schedule configuration.
const todayBaseSchema = z.object({
  businessDate: z.iso.date(),
  state: todayStateSchema,
});

export const todayAttendanceResponseSchema = z.discriminatedUnion('isWorkingDay', [
  todayBaseSchema.extend({
    isWorkingDay: z.literal(true),
    scheduledStartAt: z.iso.datetime(),
    scheduledEndAt: z.iso.datetime(),
  }),
  todayBaseSchema.extend({
    isWorkingDay: z.literal(false),
    scheduledStartAt: z.null(),
    scheduledEndAt: z.null(),
  }),
]);

export type TodayAttendanceResponse = z.infer<typeof todayAttendanceResponseSchema>;
