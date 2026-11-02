import { z } from 'zod';

// The DAY statuses an attendance day can hold (seeded by migration 0003). The codes are the stored values.
export const attendanceDayStatusSchema = z.enum([
  'PENDING',
  'PRESENT',
  'NOT_ATTEND',
  'SICK_LEAVE',
  'LEAVE',
  'DAY_OFF',
]);

export type AttendanceDayStatus = z.infer<typeof attendanceDayStatusSchema>;
