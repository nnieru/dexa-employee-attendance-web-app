import { AuthConfigSchema, BaseConfigSchema, ServiceName, type BaseConfig } from '@dexa/common';
import { passwordSchema } from '@dexa/contracts';
import { z } from 'zod';

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

// Matches accounts.company_email, varchar(254) in DATABASE §3.
const COMPANY_EMAIL_MAX_LENGTH = 254;

// A blank variable counts as unset, so an empty line in .env or compose means "not configured".
function treatBlankAsUnset(value: unknown): unknown {
  return value === '' ? undefined : value;
}

// The unique index on lower(company_email) treats letter case as equal, so the address is stored in
// lowercase, the form that every later comparison uses.
const bootstrapHrEmailSchema = z
  .email({ error: 'must be an email address' })
  .max(COMPANY_EMAIL_MAX_LENGTH, {
    error: `must be at most ${COMPANY_EMAIL_MAX_LENGTH} characters`,
  })
  .transform((email) => email.toLowerCase());

// The name that this service signs internal tokens with. The loader supplies it by default. Any other
// value is refused, because a process that signed as another service would impersonate it.
const ownServiceNameSchema = z.literal(ServiceName.AUTH_SERVICE, {
  error: `must be ${ServiceName.AUTH_SERVICE}`,
});

const serviceEnvironmentSchema = BaseConfigSchema.extend({
  SERVICE_NAME: ownServiceNameSchema,
  AUTH_DATABASE_URL: postgresUrlSchema,
  AUTH_BOOTSTRAP_HR_EMAIL: z.preprocess(treatBlankAsUnset, bootstrapHrEmailSchema.optional()),
  AUTH_BOOTSTRAP_HR_PASSWORD: z.preprocess(treatBlankAsUnset, passwordSchema.optional()),
}).superRefine(requireBootstrapHrPair);

// auth-service is the only service that issues user tokens, so it alone must hold the private key.
const tokenSettingsSchema = AuthConfigSchema.transform((tokenSettings, context) => {
  const userPrivateKey = tokenSettings.USER_JWT_PRIVATE_KEY;
  if (userPrivateKey === undefined) {
    context.addIssue({
      code: 'custom',
      path: ['USER_JWT_PRIVATE_KEY'],
      message: 'must be set for auth-service',
    });
    return z.NEVER;
  }
  return { ...tokenSettings, USER_JWT_PRIVATE_KEY: userPrivateKey };
});

export const AuthServiceConfigSchema = z.intersection(
  serviceEnvironmentSchema,
  tokenSettingsSchema,
);

export type AuthServiceConfig = z.infer<typeof AuthServiceConfigSchema>;

type BootstrapHrField = 'AUTH_BOOTSTRAP_HR_EMAIL' | 'AUTH_BOOTSTRAP_HR_PASSWORD';

type BootstrapHrPairInput = {
  readonly NODE_ENV: BaseConfig['NODE_ENV'];
  readonly AUTH_BOOTSTRAP_HR_EMAIL?: string;
  readonly AUTH_BOOTSTRAP_HR_PASSWORD?: string;
};

// Accounts are created by HR, so a production start without the first HR account would leave nobody
// able to create one. The two values are accepted together or not at all. Each message names the
// fields that are wrong, never their values.
function requireBootstrapHrPair(input: BootstrapHrPairInput, context: z.RefinementCtx): void {
  const isEmailSet = input.AUTH_BOOTSTRAP_HR_EMAIL !== undefined;
  const isPasswordSet = input.AUTH_BOOTSTRAP_HR_PASSWORD !== undefined;
  if (isEmailSet && isPasswordSet) return;

  if (!isEmailSet && !isPasswordSet) {
    if (input.NODE_ENV !== 'production') return;
    addBootstrapHrIssue(
      context,
      'AUTH_BOOTSTRAP_HR_EMAIL',
      'must be set when NODE_ENV is production',
    );
    addBootstrapHrIssue(
      context,
      'AUTH_BOOTSTRAP_HR_PASSWORD',
      'must be set when NODE_ENV is production',
    );
    return;
  }

  if (isEmailSet) {
    addBootstrapHrIssue(
      context,
      'AUTH_BOOTSTRAP_HR_PASSWORD',
      'must be set when AUTH_BOOTSTRAP_HR_EMAIL is set',
    );
  } else {
    addBootstrapHrIssue(
      context,
      'AUTH_BOOTSTRAP_HR_EMAIL',
      'must be set when AUTH_BOOTSTRAP_HR_PASSWORD is set',
    );
  }
}

function addBootstrapHrIssue(
  context: z.RefinementCtx,
  field: BootstrapHrField,
  message: string,
): void {
  context.addIssue({ code: 'custom', path: [field], message });
}
