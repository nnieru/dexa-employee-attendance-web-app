import { BaseConfigSchema } from '@dexa/common';
import { z } from 'zod';
import {
  defaultScheduleEnvironmentSchema,
  resolveDefaultScheduleSettings,
} from './default-schedule-setting.schema.js';

// pg silently falls back to local defaults for a missing host or database name, so both are required here.
// Same rule as employee-service's EMPLOYEE_DATABASE_URL (kept local so this service owns its boundary).
const postgresUrlSchema = z
  .url({
    protocol: /^postgres(ql)?$/,
    error: 'must be a postgres:// connection URL',
  })
  .pipe(z.string().refine(hasHostAndDatabase, { error: 'must name a host and a database' }));

function hasHostAndDatabase(value: string): boolean {
  const url = new URL(value);
  const databaseName = url.pathname.slice(1);
  return url.hostname !== '' && databaseName !== '';
}

const defaultScheduleSettingsSchema = defaultScheduleEnvironmentSchema.transform(
  (environment, context) => {
    const defaultSchedule = resolveDefaultScheduleSettings(environment, context);
    return defaultSchedule === undefined
      ? z.NEVER
      : { ATTENDANCE_DEFAULT_SCHEDULE: defaultSchedule };
  },
);

// Parsed once at startup (see main.ts). BUSINESS_TIMEZONE comes from BaseConfigSchema and is the zone the default
// schedule is written in (DATABASE §8).
export const AttendanceServiceConfigSchema = z.intersection(
  BaseConfigSchema.extend({ ATTENDANCE_DATABASE_URL: postgresUrlSchema }),
  defaultScheduleSettingsSchema,
);

export type AttendanceServiceConfig = z.infer<typeof AttendanceServiceConfigSchema>;
