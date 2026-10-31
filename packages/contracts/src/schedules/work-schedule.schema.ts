import { z } from 'zod';

// Local wall-clock time in the business timezone, 24-hour HH:mm (DATABASE §5.2).
const clockTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

// One company schedule version with every SCH-1 field (PRD SCH-1). effectiveUntil is exclusive and null while the
// version has no end yet.
export const workScheduleVersionSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  timezone: z.string().min(1),
  workingWeekdays: z.array(z.number().int().min(1).max(7)).min(1),
  startTime: clockTimeSchema,
  endTime: clockTimeSchema,
  lateCheckinGraceMinutes: z.number().int().nonnegative(),
  earlyCheckoutGraceMinutes: z.number().int().nonnegative(),
  lateCheckoutGraceMinutes: z.number().int().nonnegative(),
  effectiveFrom: z.iso.date(),
  effectiveUntil: z.iso.date().nullable(),
});

export type WorkScheduleVersion = z.infer<typeof workScheduleVersionSchema>;

// The version in effect today and the next version that has not taken effect yet (PRD SCH-3). current is null only
// when no version covers today; upcoming is null when no later version exists.
export const workScheduleOverviewSchema = z.object({
  current: workScheduleVersionSchema.nullable(),
  upcoming: workScheduleVersionSchema.nullable(),
});

export type WorkScheduleOverview = z.infer<typeof workScheduleOverviewSchema>;
