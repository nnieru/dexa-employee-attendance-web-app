import { z } from 'zod';

// Matches the integer grace columns in work_schedules (DATABASE §5.2), so an out-of-range value fails here
// with a field name instead of a database error at startup.
const MAX_GRACE_MINUTES = 2_147_483_647;
// 24-hour HH:MM. Overnight schedules are out of scope (DATABASE §9, decision 4), so start must precede end.
const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const WEEKDAY_PATTERN = /^[1-7]$/;
const WHOLE_NUMBER_PATTERN = /^\d+$/;
const WEEKDAY_SEPARATOR = ',';

export type DefaultScheduleSettings = {
  readonly workingWeekdays: ReadonlyArray<number>;
  readonly startTime: string;
  readonly endTime: string;
  readonly lateCheckinGraceMinutes: number;
  readonly earlyCheckoutGraceMinutes: number;
  readonly lateCheckoutGraceMinutes: number;
};

// Monday to Friday 09:00 to 18:00, late check-in grace 15 minutes, other graces 0 (PRD SCH-2, decision D-18).
const DEFAULT_SETTINGS: DefaultScheduleSettings = {
  workingWeekdays: [1, 2, 3, 4, 5],
  startTime: '09:00',
  endTime: '18:00',
  lateCheckinGraceMinutes: 15,
  earlyCheckoutGraceMinutes: 0,
  lateCheckoutGraceMinutes: 0,
};

// A blank or whitespace-only variable counts as unset, so an empty line in .env keeps the default.
function treatBlankAsUnset(value: unknown): unknown {
  return typeof value === 'string' && value.trim() === '' ? undefined : value;
}

const optionalSettingText = z.preprocess(treatBlankAsUnset, z.string().optional());

// Raw environment fields for the default schedule. The resolver below turns them into typed settings.
export const defaultScheduleEnvironmentSchema = z.object({
  ATTENDANCE_DEFAULT_SCHEDULE_WORKING_WEEKDAYS: optionalSettingText,
  ATTENDANCE_DEFAULT_SCHEDULE_START_TIME: optionalSettingText,
  ATTENDANCE_DEFAULT_SCHEDULE_END_TIME: optionalSettingText,
  ATTENDANCE_DEFAULT_SCHEDULE_LATE_CHECKIN_GRACE_MINUTES: optionalSettingText,
  ATTENDANCE_DEFAULT_SCHEDULE_EARLY_CHECKOUT_GRACE_MINUTES: optionalSettingText,
  ATTENDANCE_DEFAULT_SCHEDULE_LATE_CHECKOUT_GRACE_MINUTES: optionalSettingText,
});

type DefaultScheduleEnvironment = z.infer<typeof defaultScheduleEnvironmentSchema>;

// Each message names the variable only, never the value. Returns undefined after adding an issue.
function addIssue(context: z.RefinementCtx, field: string, message: string): undefined {
  context.addIssue({ code: 'custom', path: [field], message });
  return undefined;
}

// Blank means the default. An empty weekday list is not accepted here: the database allows it, but the
// environment cannot express "no working days" without a second convention.
function parseWorkingWeekdays(
  raw: string | undefined,
  context: z.RefinementCtx,
): ReadonlyArray<number> | undefined {
  const field = 'ATTENDANCE_DEFAULT_SCHEDULE_WORKING_WEEKDAYS';
  if (raw === undefined) return DEFAULT_SETTINGS.workingWeekdays;
  const entries = raw.split(WEEKDAY_SEPARATOR).map((entry) => entry.trim());
  if (!entries.every((entry) => WEEKDAY_PATTERN.test(entry))) {
    return addIssue(
      context,
      field,
      'must list ISO weekdays from 1 (Monday) to 7 (Sunday), comma-separated',
    );
  }
  const weekdays = entries.map(Number).sort((first, second) => first - second);
  if (new Set(weekdays).size !== weekdays.length) {
    return addIssue(context, field, 'must not repeat a weekday');
  }
  return weekdays;
}

function parseTimeOfDay(
  raw: string | undefined,
  fallback: string,
  field: string,
  context: z.RefinementCtx,
): string | undefined {
  if (raw === undefined) return fallback;
  if (!TIME_OF_DAY_PATTERN.test(raw)) {
    return addIssue(context, field, 'must be a 24-hour time in HH:MM format');
  }
  return raw;
}

function parseGraceMinutes(
  raw: string | undefined,
  fallback: number,
  field: string,
  context: z.RefinementCtx,
): number | undefined {
  if (raw === undefined) return fallback;
  if (!WHOLE_NUMBER_PATTERN.test(raw)) {
    return addIssue(context, field, 'must be a whole number of minutes, zero or more');
  }
  const minutes = Number(raw);
  if (minutes > MAX_GRACE_MINUTES) {
    return addIssue(context, field, `must be at most ${MAX_GRACE_MINUTES}`);
  }
  return minutes;
}

/**
 * Resolves the default schedule settings. A field that fails is reported, and the whole result is undefined, so no
 * partial schedule is ever seeded. Start must be before end on the same day (PRD SCH-1).
 */
export function resolveDefaultScheduleSettings(
  environment: DefaultScheduleEnvironment,
  context: z.RefinementCtx,
): DefaultScheduleSettings | undefined {
  const workingWeekdays = parseWorkingWeekdays(
    environment.ATTENDANCE_DEFAULT_SCHEDULE_WORKING_WEEKDAYS,
    context,
  );
  const startTime = parseTimeOfDay(
    environment.ATTENDANCE_DEFAULT_SCHEDULE_START_TIME,
    DEFAULT_SETTINGS.startTime,
    'ATTENDANCE_DEFAULT_SCHEDULE_START_TIME',
    context,
  );
  const endTime = parseTimeOfDay(
    environment.ATTENDANCE_DEFAULT_SCHEDULE_END_TIME,
    DEFAULT_SETTINGS.endTime,
    'ATTENDANCE_DEFAULT_SCHEDULE_END_TIME',
    context,
  );
  const lateCheckinGraceMinutes = parseGraceMinutes(
    environment.ATTENDANCE_DEFAULT_SCHEDULE_LATE_CHECKIN_GRACE_MINUTES,
    DEFAULT_SETTINGS.lateCheckinGraceMinutes,
    'ATTENDANCE_DEFAULT_SCHEDULE_LATE_CHECKIN_GRACE_MINUTES',
    context,
  );
  const earlyCheckoutGraceMinutes = parseGraceMinutes(
    environment.ATTENDANCE_DEFAULT_SCHEDULE_EARLY_CHECKOUT_GRACE_MINUTES,
    DEFAULT_SETTINGS.earlyCheckoutGraceMinutes,
    'ATTENDANCE_DEFAULT_SCHEDULE_EARLY_CHECKOUT_GRACE_MINUTES',
    context,
  );
  const lateCheckoutGraceMinutes = parseGraceMinutes(
    environment.ATTENDANCE_DEFAULT_SCHEDULE_LATE_CHECKOUT_GRACE_MINUTES,
    DEFAULT_SETTINGS.lateCheckoutGraceMinutes,
    'ATTENDANCE_DEFAULT_SCHEDULE_LATE_CHECKOUT_GRACE_MINUTES',
    context,
  );
  if (
    workingWeekdays === undefined ||
    startTime === undefined ||
    endTime === undefined ||
    lateCheckinGraceMinutes === undefined ||
    earlyCheckoutGraceMinutes === undefined ||
    lateCheckoutGraceMinutes === undefined
  ) {
    return undefined;
  }
  if (startTime >= endTime) {
    return addIssue(
      context,
      'ATTENDANCE_DEFAULT_SCHEDULE_END_TIME',
      'must be later than ATTENDANCE_DEFAULT_SCHEDULE_START_TIME on the same day',
    );
  }
  return {
    workingWeekdays,
    startTime,
    endTime,
    lateCheckinGraceMinutes,
    earlyCheckoutGraceMinutes,
    lateCheckoutGraceMinutes,
  };
}
