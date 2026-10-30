import {
  AuthConfigSchema,
  BaseConfigSchema,
  internalBaseUrlSchema,
  ServiceName,
  type BaseConfig,
} from '@dexa/common';
import { z } from 'zod';
import {
  masterCodeSchema,
  resolveMasterDataSetting,
  type MasterDataDocument,
} from './master-data-setting.schema.js';
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

// The bootstrap HR values also treat whitespace-only as unset, because a name of spaces is not a name.
function treatWhitespaceAsUnset(value: unknown): unknown {
  return typeof value === 'string' && value.trim() === '' ? undefined : value;
}

// Matches accounts.company_email, varchar(254) in DATABASE §3.
const BOOTSTRAP_HR_EMAIL_MAX_LENGTH = 254;
// Matches employees.name, varchar(150) in DATABASE §4.
const BOOTSTRAP_HR_NAME_MAX_LENGTH = 150;

const bootstrapHrEmailSchema = z.preprocess(
  treatWhitespaceAsUnset,
  z
    .string()
    .trim()
    .max(BOOTSTRAP_HR_EMAIL_MAX_LENGTH, {
      error: `must be at most ${BOOTSTRAP_HR_EMAIL_MAX_LENGTH} characters`,
    })
    .pipe(z.email({ error: 'must be an email address' }))
    .optional(),
);

const bootstrapHrNameSchema = z.preprocess(
  treatWhitespaceAsUnset,
  z
    .string()
    .trim()
    .max(BOOTSTRAP_HR_NAME_MAX_LENGTH, {
      error: `must be at most ${BOOTSTRAP_HR_NAME_MAX_LENGTH} characters`,
    })
    .optional(),
);

const bootstrapHrPositionCodeSchema = z.preprocess(
  treatWhitespaceAsUnset,
  masterCodeSchema.optional(),
);

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
  // The email must match AUTH_BOOTSTRAP_HR_EMAIL in auth-service. Each service reads only its own setting,
  // so the two cannot be checked against each other here.
  EMPLOYEE_BOOTSTRAP_HR_EMAIL: bootstrapHrEmailSchema,
  EMPLOYEE_BOOTSTRAP_HR_NAME: bootstrapHrNameSchema,
  EMPLOYEE_BOOTSTRAP_HR_POSITION_CODE: bootstrapHrPositionCodeSchema,
});

// The master data and photo directory settings depend on NODE_ENV, so they are resolved after the other
// variables parse.
const resolvedSettingsSchema = employeeServiceEnvironmentSchema
  .superRefine(requireBootstrapHrSettings)
  .transform((environment, context) => {
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
  });

// Token settings are shared with every service (libs/common/src/config/auth-config.schema.ts). The
// user private key is refused by the loader, so this service only verifies user tokens.
export const EmployeeServiceConfigSchema = z.intersection(resolvedSettingsSchema, AuthConfigSchema);

export type EmployeeServiceConfig = z.infer<typeof EmployeeServiceConfigSchema>;

const BOOTSTRAP_HR_FIELDS = [
  'EMPLOYEE_BOOTSTRAP_HR_EMAIL',
  'EMPLOYEE_BOOTSTRAP_HR_NAME',
  'EMPLOYEE_BOOTSTRAP_HR_POSITION_CODE',
] as const;

type BootstrapHrField = (typeof BOOTSTRAP_HR_FIELDS)[number];

type BootstrapHrInput = {
  readonly NODE_ENV: BaseConfig['NODE_ENV'];
} & Partial<Record<BootstrapHrField, string>>;

// The HR profile needs all three values, so they are accepted together or not at all. A production start
// without them would leave no employee profile for the first HR account. Each message names the field only.
function requireBootstrapHrSettings(input: BootstrapHrInput, context: z.RefinementCtx): void {
  const missingFields = BOOTSTRAP_HR_FIELDS.filter((field) => input[field] === undefined);
  if (missingFields.length === 0) return;

  const isNoneSet = missingFields.length === BOOTSTRAP_HR_FIELDS.length;
  if (isNoneSet && input.NODE_ENV !== 'production') return;

  const message = isNoneSet
    ? 'must be set when NODE_ENV is production'
    : 'must be set when the other EMPLOYEE_BOOTSTRAP_HR settings are set';
  for (const field of missingFields) {
    context.addIssue({ code: 'custom', path: [field], message });
  }
}
