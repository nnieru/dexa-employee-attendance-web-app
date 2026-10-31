import {
  AuthConfigSchema,
  BaseConfigSchema,
  internalBaseUrlSchema,
  ServiceName,
} from '@dexa/common';
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

// The name this service signs internal tokens with. The loader supplies it by default. Any other value is refused,
// because a process that signed as another service would impersonate it.
const ownServiceNameSchema = z.literal(ServiceName.ATTENDANCE_SERVICE, {
  error: `must be ${ServiceName.ATTENDANCE_SERVICE}`,
});

// Parsed once at startup (see main.ts). BUSINESS_TIMEZONE comes from BaseConfigSchema and is the zone the default
// schedule is written in (DATABASE §8).
const attendanceEnvironmentSchema = z.intersection(
  BaseConfigSchema.extend({
    SERVICE_NAME: ownServiceNameSchema,
    ATTENDANCE_DATABASE_URL: postgresUrlSchema,
    // Every user-token request checks the account with auth-service (JwtAuthGuard), so the URL is required.
    AUTH_SERVICE_INTERNAL_URL: internalBaseUrlSchema,
    // The HR attendance list resolves names through employee-service's batched lookup (PRD ADM-4).
    EMPLOYEE_SERVICE_INTERNAL_URL: internalBaseUrlSchema,
  }),
  defaultScheduleSettingsSchema,
);

// Token settings are shared with every service (libs/common/src/config/auth-config.schema.ts). The user private key
// is refused by the loader, so this service only verifies user tokens.
export const AttendanceServiceConfigSchema = z.intersection(
  attendanceEnvironmentSchema,
  AuthConfigSchema,
);

export type AttendanceServiceConfig = z.infer<typeof AttendanceServiceConfigSchema>;
