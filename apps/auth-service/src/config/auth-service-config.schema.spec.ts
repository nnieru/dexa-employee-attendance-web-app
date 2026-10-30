import { parseConfig, ServiceName } from '@dexa/common';
import { authServiceEnvironment, generateAuthKeySet } from '../../test/auth-key-set.js';
import { AuthServiceConfigSchema } from './auth-service-config.schema.js';

// Placeholder password. The rejection cases check that it never appears in an error message.
const PLACEHOLDER_PASSWORD = 'test-only-password';
// Generated once for the file. The config only needs well-formed keys, which the environment supplies.
const TEST_KEYS = generateAuthKeySet();
const BASE_SOURCE = authServiceEnvironment(TEST_KEYS);
const DATABASE_URL = `postgres://auth_app:${PLACEHOLDER_PASSWORD}@postgres:5432/auth_db`;
const PROTOCOL_MESSAGE = 'must be a postgres:// connection URL';
const TARGET_MESSAGE = 'must name a host and a database';

// Mixed case, so the accepted-config cases also prove that the email is stored in lowercase.
const BOOTSTRAP_EMAIL = 'HR.Admin@Dexa.Test';
const STORED_BOOTSTRAP_EMAIL = 'hr.admin@dexa.test';
const BOOTSTRAP_PASSWORD = 'hr-admin-pass-1';
const EMAIL_FORMAT_MESSAGE = 'must be an email address';
const EMAIL_LENGTH_MESSAGE = 'must be at most 254 characters';
const PASSWORD_DIGIT_MESSAGE = 'Password must include a number.';
const PASSWORD_LENGTH_MESSAGE = 'Password must be at least 8 characters.';
// 260 characters. Each label is at most 63 characters, so the only thing wrong is the length.
const LONG_DOMAIN = `${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(63)}.com`;
const OVER_LIMIT_EMAIL = `${'a'.repeat(64)}@${LONG_DOMAIN}`;

const PRODUCTION = { NODE_ENV: 'production' };
const BOTH_BOOTSTRAP_VARIABLES = {
  AUTH_BOOTSTRAP_HR_EMAIL: BOOTSTRAP_EMAIL,
  AUTH_BOOTSTRAP_HR_PASSWORD: BOOTSTRAP_PASSWORD,
};
const BLANK_BOOTSTRAP_VARIABLES = { AUTH_BOOTSTRAP_HR_EMAIL: '', AUTH_BOOTSTRAP_HR_PASSWORD: '' };
const PRODUCTION_REQUIRED_MESSAGE =
  'Invalid configuration: AUTH_BOOTSTRAP_HR_EMAIL: must be set when NODE_ENV is production; ' +
  'AUTH_BOOTSTRAP_HR_PASSWORD: must be set when NODE_ENV is production';

function sourceWith(
  variables: Record<string, string | undefined>,
): Record<string, string | undefined> {
  return { ...BASE_SOURCE, AUTH_DATABASE_URL: DATABASE_URL, ...variables };
}

describe('AuthServiceConfigSchema AUTH_DATABASE_URL', () => {
  it.each([
    `postgres://auth_app:${PLACEHOLDER_PASSWORD}@postgres:5432/auth_db`,
    `postgresql://auth_app:${PLACEHOLDER_PASSWORD}@127.0.0.1:5432/auth_db`,
  ])('should accept %s when it names a host and a database', (databaseUrl) => {
    const config = parseConfig(AuthServiceConfigSchema, {
      ...BASE_SOURCE,
      AUTH_DATABASE_URL: databaseUrl,
    });

    expect(config.AUTH_DATABASE_URL).toBe(databaseUrl);
  });

  it.each([
    { condition: 'the variable is unset', databaseUrl: undefined, message: PROTOCOL_MESSAGE },
    { condition: 'the value is empty', databaseUrl: '', message: PROTOCOL_MESSAGE },
    {
      condition: 'the scheme is not postgres',
      databaseUrl: `http://auth_app:${PLACEHOLDER_PASSWORD}@postgres/auth_db`,
      message: PROTOCOL_MESSAGE,
    },
    {
      condition: 'the host is missing',
      databaseUrl: 'postgres:///auth_db',
      message: TARGET_MESSAGE,
    },
    {
      condition: 'the database name is missing',
      databaseUrl: `postgres://auth_app:${PLACEHOLDER_PASSWORD}@postgres:5432/`,
      message: TARGET_MESSAGE,
    },
  ])('should reject the config when $condition', ({ databaseUrl, message }) => {
    // The exact message proves that only the field name is reported, never the URL or its password.
    expect(() =>
      parseConfig(AuthServiceConfigSchema, { ...BASE_SOURCE, AUTH_DATABASE_URL: databaseUrl }),
    ).toThrow(new Error(`Invalid configuration: AUTH_DATABASE_URL: ${message}`));
  });
});

describe('AuthServiceConfigSchema RABBITMQ_URL', () => {
  it.each([
    'amqp://auth-service:placeholder@rabbitmq:5672',
    'amqps://auth-service:placeholder@rabbitmq.internal:5671/%2f',
  ])('should accept %s when it is an AMQP connection URL', (brokerUrl) => {
    const config = parseConfig(AuthServiceConfigSchema, sourceWith({ RABBITMQ_URL: brokerUrl }));

    expect(config.RABBITMQ_URL).toBe(brokerUrl);
  });

  it.each([
    { condition: 'the variable is unset', brokerUrl: undefined },
    { condition: 'the value is empty', brokerUrl: '' },
    { condition: 'the scheme is not AMQP', brokerUrl: 'http://rabbitmq:5672' },
  ])('should reject the config when $condition', ({ brokerUrl }) => {
    // The exact message shows that the URL, which carries the broker password, is not echoed back.
    expect(() =>
      parseConfig(AuthServiceConfigSchema, sourceWith({ RABBITMQ_URL: brokerUrl })),
    ).toThrow(
      new Error(
        'Invalid configuration: RABBITMQ_URL: must be an amqp:// or amqps:// connection URL',
      ),
    );
  });
});

describe('AuthServiceConfigSchema token settings', () => {
  it('should return the user private key when auth-service has one', () => {
    const config = parseConfig(AuthServiceConfigSchema, sourceWith({}));

    expect(config.USER_JWT_PRIVATE_KEY).toContain('PRIVATE KEY');
  });

  it('should reject the config and name the field when the user private key is unset', () => {
    expect(() =>
      parseConfig(AuthServiceConfigSchema, sourceWith({ USER_JWT_PRIVATE_KEY: undefined })),
    ).toThrow(
      new Error('Invalid configuration: USER_JWT_PRIVATE_KEY: must be set for auth-service'),
    );
  });

  it('should accept the config when SERVICE_NAME is auth-service', () => {
    const config = parseConfig(
      AuthServiceConfigSchema,
      sourceWith({ SERVICE_NAME: ServiceName.AUTH_SERVICE }),
    );

    expect(config.SERVICE_NAME).toBe(ServiceName.AUTH_SERVICE);
  });

  it('should reject the config when SERVICE_NAME names another service', () => {
    // Otherwise this process would sign internal tokens as that service. The key check also fails,
    // because the key pair belongs to auth-service, so the message is matched by its field part.
    expect(() =>
      parseConfig(AuthServiceConfigSchema, sourceWith({ SERVICE_NAME: ServiceName.API_GATEWAY })),
    ).toThrow(/Invalid configuration: SERVICE_NAME: must be auth-service/);
  });
});

describe('AuthServiceConfigSchema bootstrap HR account', () => {
  it.each([
    { condition: 'both variables are unset', variables: {} },
    { condition: 'both variables are blank', variables: BLANK_BOOTSTRAP_VARIABLES },
  ])('should accept no bootstrap account in development when $condition', ({ variables }) => {
    const config = parseConfig(AuthServiceConfigSchema, sourceWith(variables));

    expect(config.AUTH_BOOTSTRAP_HR_EMAIL).toBeUndefined();
    expect(config.AUTH_BOOTSTRAP_HR_PASSWORD).toBeUndefined();
  });

  it('should return the email in lowercase when both variables are set', () => {
    const config = parseConfig(AuthServiceConfigSchema, sourceWith(BOTH_BOOTSTRAP_VARIABLES));

    expect(config.AUTH_BOOTSTRAP_HR_EMAIL).toBe(STORED_BOOTSTRAP_EMAIL);
    expect(config.AUTH_BOOTSTRAP_HR_PASSWORD).toBe(BOOTSTRAP_PASSWORD);
  });

  it('should accept the bootstrap account in production when both variables are set', () => {
    const config = parseConfig(
      AuthServiceConfigSchema,
      sourceWith({ ...PRODUCTION, ...BOTH_BOOTSTRAP_VARIABLES }),
    );

    expect(config.AUTH_BOOTSTRAP_HR_EMAIL).toBe(STORED_BOOTSTRAP_EMAIL);
  });

  it.each([
    { condition: 'neither variable is set', variables: {} },
    { condition: 'both variables are blank', variables: BLANK_BOOTSTRAP_VARIABLES },
  ])('should reject the config in production when $condition', ({ variables }) => {
    expect(() =>
      parseConfig(AuthServiceConfigSchema, sourceWith({ ...PRODUCTION, ...variables })),
    ).toThrow(new Error(PRODUCTION_REQUIRED_MESSAGE));
  });

  it.each([
    {
      condition: 'only the email is set',
      environment: {},
      variables: { AUTH_BOOTSTRAP_HR_EMAIL: BOOTSTRAP_EMAIL },
      message: 'AUTH_BOOTSTRAP_HR_PASSWORD: must be set when AUTH_BOOTSTRAP_HR_EMAIL is set',
    },
    {
      condition: 'only the password is set',
      environment: {},
      variables: { AUTH_BOOTSTRAP_HR_PASSWORD: BOOTSTRAP_PASSWORD },
      message: 'AUTH_BOOTSTRAP_HR_EMAIL: must be set when AUTH_BOOTSTRAP_HR_PASSWORD is set',
    },
    {
      condition: 'only the email is set in production',
      environment: PRODUCTION,
      variables: { AUTH_BOOTSTRAP_HR_EMAIL: BOOTSTRAP_EMAIL },
      message: 'AUTH_BOOTSTRAP_HR_PASSWORD: must be set when AUTH_BOOTSTRAP_HR_EMAIL is set',
    },
  ])(
    'should reject the config and name the missing field when $condition',
    ({ environment, variables, message }) => {
      expect(() =>
        parseConfig(AuthServiceConfigSchema, sourceWith({ ...environment, ...variables })),
      ).toThrow(new Error(`Invalid configuration: ${message}`));
    },
  );

  it.each([
    {
      condition: 'the password has no digit',
      password: 'abcdefgh',
      message: PASSWORD_DIGIT_MESSAGE,
    },
    {
      condition: 'the password is shorter than 8 characters',
      password: 'abc1',
      message: PASSWORD_LENGTH_MESSAGE,
    },
  ])('should reject the config when $condition', ({ password, message }) => {
    expect(() =>
      parseConfig(
        AuthServiceConfigSchema,
        sourceWith({
          AUTH_BOOTSTRAP_HR_EMAIL: BOOTSTRAP_EMAIL,
          AUTH_BOOTSTRAP_HR_PASSWORD: password,
        }),
      ),
    ).toThrow(new Error(`Invalid configuration: AUTH_BOOTSTRAP_HR_PASSWORD: ${message}`));
  });

  it.each([
    {
      condition: 'the email is not an address',
      email: 'not-an-email',
      message: EMAIL_FORMAT_MESSAGE,
    },
    {
      condition: 'the email is longer than 254 characters',
      email: OVER_LIMIT_EMAIL,
      message: EMAIL_LENGTH_MESSAGE,
    },
  ])('should reject the config when $condition', ({ email, message }) => {
    expect(() =>
      parseConfig(
        AuthServiceConfigSchema,
        sourceWith({
          AUTH_BOOTSTRAP_HR_EMAIL: email,
          AUTH_BOOTSTRAP_HR_PASSWORD: BOOTSTRAP_PASSWORD,
        }),
      ),
    ).toThrow(new Error(`Invalid configuration: AUTH_BOOTSTRAP_HR_EMAIL: ${message}`));
  });
});
