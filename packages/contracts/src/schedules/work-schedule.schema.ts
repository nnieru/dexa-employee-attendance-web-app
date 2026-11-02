import { z } from 'zod';

// Local wall-clock time in the business timezone, 24-hour HH:mm.
const clockTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

// One company schedule version with every schedule field. effectiveUntil is exclusive and null while the
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

const WEEKDAY_MIN = 1;
const WEEKDAY_MAX = 7;

// Strict, so a client cannot send effectiveUntil (the service sets it), the timezone (the service uses the
// configured business timezone), or a name. The version the client edits is identified by the route, not the body.
export const workScheduleVersionRequestSchema = z
  .strictObject({
    workingWeekdays: z
      .array(z.number().int().min(WEEKDAY_MIN).max(WEEKDAY_MAX))
      .min(1)
      .refine((weekdays) => new Set(weekdays).size === weekdays.length, {
        error: 'must list each weekday once',
      }),
    startTime: clockTimeSchema,
    endTime: clockTimeSchema,
    lateCheckinGraceMinutes: z.number().int().nonnegative(),
    earlyCheckoutGraceMinutes: z.number().int().nonnegative(),
    lateCheckoutGraceMinutes: z.number().int().nonnegative(),
    effectiveFrom: z.iso.date(),
  })
  // Both times are on the same business day, so a plain string comparison of HH:mm is a time comparison.
  .refine((request) => request.startTime < request.endTime, {
    error: 'must be before endTime',
    path: ['startTime'],
  });

export type WorkScheduleVersionRequest = z.infer<typeof workScheduleVersionRequestSchema>;

// The version id in a route, such as PUT /work-schedules/:id.
export const workScheduleIdSchema = z.uuid();

// The version in effect today and the next version that has not taken effect yet. current is null only
// when no version covers today; upcoming is null when no later version exists.
export const workScheduleOverviewSchema = z.object({
  current: workScheduleVersionSchema.nullable(),
  upcoming: workScheduleVersionSchema.nullable(),
});

export type WorkScheduleOverview = z.infer<typeof workScheduleOverviewSchema>;
