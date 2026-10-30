import {
  AuthConfigSchema,
  BaseConfigSchema,
  internalBaseUrlSchema,
  ServiceName,
} from '@dexa/common';
import { z } from 'zod';
import { resolveMasterDataSetting, type MasterDataDocument } from './master-data-setting.schema.js';
import { resolvePhotoDirectorySetting } from './photo-directory-setting.js';

// pg silently falls back to local defaults for a missing host or database name, so both are
// required here. Otherwise a bad URL would only surface at the first query.
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

// A blank variable counts as unset, so an empty line in .env or compose means "not configured".
function treatBlankAsUnset(value: unknown): unknown {
  return value === '' ? undefined : value;
}

// The name that this service signs internal tokens with. The loader supplies it by default. Any other
// value is refused, because a process that signed as another service would impersonate it.
const ownServiceNameSchema = z.literal(ServiceName.EMPLOYEE_SERVICE, {
  error: `must be ${ServiceName.EMPLOYEE_SERVICE}`,
});

const employeeServiceEnvironmentSchema = BaseConfigSchema.extend({
  SERVICE_NAME: ownServiceNameSchema,
  EMPLOYEE_DATABASE_URL: postgresUrlSchema,
  EMPLOYEE_MASTER_DATA: z.preprocess(treatBlankAsUnset, z.string().optional()),
  EMPLOYEE_PHOTO_DIRECTORY: z.preprocess(treatBlankAsUnset, z.string().optional()),
  // Every user-token request checks the account with auth-service (JwtAuthGuard), so the URL is required.
  AUTH_SERVICE_INTERNAL_URL: internalBaseUrlSchema,
});

// The master data and photo directory settings depend on NODE_ENV, so they are resolved after the other
// variables parse.
const resolvedSettingsSchema = employeeServiceEnvironmentSchema.transform(
  (environment, context) => {
    const masterData: MasterDataDocument | undefined = resolveMasterDataSetting(
      environment.NODE_ENV,
      environment.EMPLOYEE_MASTER_DATA,
      context,
    );
    const photoDirectory = resolvePhotoDirectorySetting(
      environment.NODE_ENV,
      environment.EMPLOYEE_PHOTO_DIRECTORY,
      context,
    );
    return {
      ...environment,
      EMPLOYEE_MASTER_DATA: masterData,
      EMPLOYEE_PHOTO_DIRECTORY: photoDirectory,
    };
  },
);

// Token settings are shared with every service (libs/common/src/config/auth-config.schema.ts). The
// user private key is refused by the loader, so this service only verifies user tokens.
export const EmployeeServiceConfigSchema = z.intersection(resolvedSettingsSchema, AuthConfigSchema);

export type EmployeeServiceConfig = z.infer<typeof EmployeeServiceConfigSchema>;
