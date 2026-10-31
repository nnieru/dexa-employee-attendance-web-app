import { ServiceName } from '../auth/service-name.js';
import {
  authEnvironmentFor,
  userJwtSigningEnvironmentFor,
  userJwtVerifierEnvironmentFor,
  encodeKeyForEnvironment,
  generateAuthKeySet,
  generateEcKeyPair,
  generateRsaKeyPair,
  servicePair,
  type AuthKeySet,
} from '../../test/auth-key-set.js';
import {
  AuthConfigSchema,
  UserJwtSigningConfigSchema,
  UserJwtVerifierConfigSchema,
  serviceJwtPublicKeyVariable,
} from './auth-config.schema.js';
import { parseConfig } from './parse-config.js';

const USER_PUBLIC_KEY_MESSAGE = 'must be a base64-encoded PEM RSA public key of at least 2048 bits';
const USER_PRIVATE_KEY_MESSAGE =
  'must be a base64-encoded PEM RSA private key of at least 2048 bits';
const SERVICE_PUBLIC_KEY_MESSAGE = 'must be a base64-encoded PEM EC P-256 public key';
const SERVICE_PRIVATE_KEY_MESSAGE = 'must be a base64-encoded PEM EC P-256 private key';
const P384_CURVE_NAME = 'secp384r1';
const SMALL_RSA_MODULUS_BITS = 1024;

type KeyRejection = {
  readonly condition: string;
  readonly variable: string;
  // Builds the raw environment value. undefined means the variable is absent.
  readonly value: () => string | undefined;
  readonly message: string;
};

describe('AuthConfigSchema', () => {
  let keys: AuthKeySet;
  let validSource: Record<string, string>;

  beforeAll(() => {
    keys = generateAuthKeySet();
    validSource = authEnvironmentFor(keys, ServiceName.EMPLOYEE_SERVICE);
  });

  it('should return the decoded keys when every key matches its service', () => {
    const config = parseConfig(AuthConfigSchema, validSource);

    expect(config.SERVICE_NAME).toBe(ServiceName.EMPLOYEE_SERVICE);
    expect(config.SERVICE_JWT_PRIVATE_KEY).toBe(
      servicePair(keys, ServiceName.EMPLOYEE_SERVICE).privateKeyPem,
    );
    expect(config.SERVICE_JWT_PUBLIC_KEYS.get(ServiceName.AUTH_SERVICE)).toBe(
      servicePair(keys, ServiceName.AUTH_SERVICE).publicKeyPem,
    );
  });

  it.each(Object.values(ServiceName))(
    'should accept the config when SERVICE_NAME is %s',
    (name) => {
      const config = parseConfig(AuthConfigSchema, authEnvironmentFor(keys, name));

      expect(config.SERVICE_NAME).toBe(name);
    },
  );

  it('should reject the config when SERVICE_JWT_PRIVATE_KEY is another service key', () => {
    const source = {
      ...validSource,
      SERVICE_JWT_PRIVATE_KEY: encodeKeyForEnvironment(
        servicePair(keys, ServiceName.AUTH_SERVICE).privateKeyPem,
      ),
    };

    expect(() => parseConfig(AuthConfigSchema, source)).toThrow(
      new Error(
        `Invalid configuration: SERVICE_JWT_PRIVATE_KEY: must match ${serviceJwtPublicKeyVariable(ServiceName.EMPLOYEE_SERVICE)}`,
      ),
    );
  });

  it('should report every missing service public key in one error when several are missing', () => {
    const source = { ...validSource };
    delete source[serviceJwtPublicKeyVariable(ServiceName.AUTH_SERVICE)];
    delete source[serviceJwtPublicKeyVariable(ServiceName.AUDIT_WORKER)];

    expect(() => parseConfig(AuthConfigSchema, source)).toThrow(
      new Error(
        `Invalid configuration: AUTH_SERVICE_SERVICE_JWT_PUBLIC_KEY: ${SERVICE_PUBLIC_KEY_MESSAGE}; AUDIT_WORKER_SERVICE_JWT_PUBLIC_KEY: ${SERVICE_PUBLIC_KEY_MESSAGE}`,
      ),
    );
  });

  it.each([
    {
      condition: 'the name has a dash',
      serviceName: ServiceName.API_GATEWAY,
      variable: 'API_GATEWAY_SERVICE_JWT_PUBLIC_KEY',
    },
    {
      condition: 'the name ends in service',
      serviceName: ServiceName.AUTH_SERVICE,
      variable: 'AUTH_SERVICE_SERVICE_JWT_PUBLIC_KEY',
    },
    {
      condition: 'the name is audit-worker',
      serviceName: ServiceName.AUDIT_WORKER,
      variable: 'AUDIT_WORKER_SERVICE_JWT_PUBLIC_KEY',
    },
  ])(
    'should derive the public key variable from the service name when $condition',
    ({ serviceName, variable }) => {
      expect(serviceJwtPublicKeyVariable(serviceName)).toBe(variable);
    },
  );

  const keyRejections: ReadonlyArray<KeyRejection> = [
    {
      condition: 'SERVICE_JWT_PRIVATE_KEY is an RSA key, which is the wrong key type',
      variable: 'SERVICE_JWT_PRIVATE_KEY',
      value: () => encodeKeyForEnvironment(generateRsaKeyPair().privateKeyPem),
      message: SERVICE_PRIVATE_KEY_MESSAGE,
    },
    {
      condition: 'SERVICE_JWT_PRIVATE_KEY is on the P-384 curve, which is the wrong curve',
      variable: 'SERVICE_JWT_PRIVATE_KEY',
      value: () => encodeKeyForEnvironment(generateEcKeyPair(P384_CURVE_NAME).privateKeyPem),
      message: SERVICE_PRIVATE_KEY_MESSAGE,
    },
    {
      condition: 'SERVICE_JWT_PRIVATE_KEY holds a public key',
      variable: 'SERVICE_JWT_PRIVATE_KEY',
      value: () =>
        encodeKeyForEnvironment(servicePair(keys, ServiceName.EMPLOYEE_SERVICE).publicKeyPem),
      message: SERVICE_PRIVATE_KEY_MESSAGE,
    },
    {
      condition: 'SERVICE_JWT_PRIVATE_KEY is not base64',
      variable: 'SERVICE_JWT_PRIVATE_KEY',
      value: () => 'not base64!!',
      message: SERVICE_PRIVATE_KEY_MESSAGE,
    },
    {
      condition: 'AUTH_SERVICE_SERVICE_JWT_PUBLIC_KEY is on the P-384 curve',
      variable: 'AUTH_SERVICE_SERVICE_JWT_PUBLIC_KEY',
      value: () => encodeKeyForEnvironment(generateEcKeyPair(P384_CURVE_NAME).publicKeyPem),
      message: SERVICE_PUBLIC_KEY_MESSAGE,
    },
    {
      condition: 'AUTH_SERVICE_SERVICE_JWT_PUBLIC_KEY is an RSA key',
      variable: 'AUTH_SERVICE_SERVICE_JWT_PUBLIC_KEY',
      value: () => encodeKeyForEnvironment(generateRsaKeyPair().publicKeyPem),
      message: SERVICE_PUBLIC_KEY_MESSAGE,
    },
    {
      condition: 'AUTH_SERVICE_SERVICE_JWT_PUBLIC_KEY holds a private key',
      variable: 'AUTH_SERVICE_SERVICE_JWT_PUBLIC_KEY',
      value: () =>
        encodeKeyForEnvironment(servicePair(keys, ServiceName.AUTH_SERVICE).privateKeyPem),
      message: SERVICE_PUBLIC_KEY_MESSAGE,
    },
    {
      condition: 'AUDIT_WORKER_SERVICE_JWT_PUBLIC_KEY is missing',
      variable: 'AUDIT_WORKER_SERVICE_JWT_PUBLIC_KEY',
      value: () => undefined,
      message: SERVICE_PUBLIC_KEY_MESSAGE,
    },
  ];

  it.each(keyRejections)(
    'should reject the config and name only the variable when $condition',
    ({ variable, value, message }) => {
      const source: Record<string, string | undefined> = { ...validSource, [variable]: value() };

      expect(() => parseConfig(AuthConfigSchema, source)).toThrow(
        new Error(`Invalid configuration: ${variable}: ${message}`),
      );
    },
  );

  it('should not echo a rejected key value into the error message', () => {
    const rejectedValue = 'secret-marker-that-must-not-be-echoed';
    const variable = serviceJwtPublicKeyVariable(ServiceName.AUTH_SERVICE);
    const source = { ...validSource, [variable]: rejectedValue };

    let message = '';
    try {
      parseConfig(AuthConfigSchema, source);
    } catch (error: unknown) {
      message = error instanceof Error ? error.message : '';
    }

    expect(message).toContain(variable);
    expect(message).not.toContain(rejectedValue);
  });

  it.each(['billing-service', 'Employee-Service', ''])(
    'should reject the config when SERVICE_NAME is %p',
    (name) => {
      expect(() => parseConfig(AuthConfigSchema, { ...validSource, SERVICE_NAME: name })).toThrow(
        new Error('Invalid configuration: SERVICE_NAME: must be a known service name'),
      );
    },
  );
});

describe('UserJwtVerifierConfigSchema', () => {
  let keys: AuthKeySet;
  let validSource: Record<string, string>;

  beforeAll(() => {
    keys = generateAuthKeySet();
    validSource = userJwtVerifierEnvironmentFor(keys);
  });

  it('should return the decoded user public key with the issuer and audience', () => {
    const config = parseConfig(UserJwtVerifierConfigSchema, validSource);

    expect(config).toEqual({
      USER_JWT_ISSUER: validSource.USER_JWT_ISSUER,
      USER_JWT_AUDIENCE: validSource.USER_JWT_AUDIENCE,
      USER_JWT_PUBLIC_KEY: keys.user.publicKeyPem,
    });
  });

  it.each(['USER_JWT_ISSUER', 'USER_JWT_AUDIENCE'] as const)(
    'should reject the config when %s is empty',
    (field) => {
      expect(() =>
        parseConfig(UserJwtVerifierConfigSchema, { ...validSource, [field]: '' }),
      ).toThrow(new Error(`Invalid configuration: ${field}: must not be empty`));
    },
  );

  it.each([
    {
      condition: 'USER_JWT_PUBLIC_KEY is an EC key, which is the wrong key type',
      variable: 'USER_JWT_PUBLIC_KEY',
      value: () => encodeKeyForEnvironment(generateEcKeyPair().publicKeyPem),
      message: USER_PUBLIC_KEY_MESSAGE,
    },
    {
      condition: 'USER_JWT_PUBLIC_KEY is an RSA key below 2048 bits',
      variable: 'USER_JWT_PUBLIC_KEY',
      value: () => encodeKeyForEnvironment(generateRsaKeyPair(SMALL_RSA_MODULUS_BITS).publicKeyPem),
      message: USER_PUBLIC_KEY_MESSAGE,
    },
    {
      condition: 'USER_JWT_PUBLIC_KEY holds a private key',
      variable: 'USER_JWT_PUBLIC_KEY',
      value: () => encodeKeyForEnvironment(keys.user.privateKeyPem),
      message: USER_PUBLIC_KEY_MESSAGE,
    },
    {
      condition: 'USER_JWT_PUBLIC_KEY is not base64',
      variable: 'USER_JWT_PUBLIC_KEY',
      value: () => 'not base64!!',
      message: USER_PUBLIC_KEY_MESSAGE,
    },
    {
      condition: 'USER_JWT_PUBLIC_KEY is missing',
      variable: 'USER_JWT_PUBLIC_KEY',
      value: () => undefined,
      message: USER_PUBLIC_KEY_MESSAGE,
    },
  ])(
    'should reject the config and name only the variable when $condition',
    ({ variable, value, message }) => {
      const source: Record<string, string | undefined> = { ...validSource, [variable]: value() };

      expect(() => parseConfig(UserJwtVerifierConfigSchema, source)).toThrow(
        new Error(`Invalid configuration: ${variable}: ${message}`),
      );
    },
  );
});

describe('UserJwtSigningConfigSchema', () => {
  let keys: AuthKeySet;
  let validSource: Record<string, string>;

  beforeAll(() => {
    keys = generateAuthKeySet();
    validSource = userJwtSigningEnvironmentFor(keys);
  });

  it('should return no user private key when USER_JWT_PRIVATE_KEY is absent', () => {
    const verifierOnly = userJwtVerifierEnvironmentFor(keys);

    expect(
      parseConfig(UserJwtSigningConfigSchema, verifierOnly).USER_JWT_PRIVATE_KEY,
    ).toBeUndefined();
  });

  it('should return no user private key when USER_JWT_PRIVATE_KEY is blank', () => {
    const config = parseConfig(UserJwtSigningConfigSchema, {
      ...validSource,
      USER_JWT_PRIVATE_KEY: '',
    });

    expect(config.USER_JWT_PRIVATE_KEY).toBeUndefined();
  });

  it('should return the user private key when it is the pair of USER_JWT_PUBLIC_KEY', () => {
    const source = {
      ...validSource,
      USER_JWT_PRIVATE_KEY: encodeKeyForEnvironment(keys.user.privateKeyPem),
    };

    expect(parseConfig(UserJwtSigningConfigSchema, source).USER_JWT_PRIVATE_KEY).toBe(
      keys.user.privateKeyPem,
    );
  });

  it('should reject the config when USER_JWT_PRIVATE_KEY does not match USER_JWT_PUBLIC_KEY', () => {
    const source = {
      ...validSource,
      USER_JWT_PRIVATE_KEY: encodeKeyForEnvironment(generateRsaKeyPair().privateKeyPem),
    };

    expect(() => parseConfig(UserJwtSigningConfigSchema, source)).toThrow(
      new Error('Invalid configuration: USER_JWT_PRIVATE_KEY: must match USER_JWT_PUBLIC_KEY'),
    );
  });

  it.each([
    {
      condition: 'USER_JWT_PRIVATE_KEY is an RSA key below 2048 bits',
      variable: 'USER_JWT_PRIVATE_KEY',
      value: () =>
        encodeKeyForEnvironment(generateRsaKeyPair(SMALL_RSA_MODULUS_BITS).privateKeyPem),
      message: USER_PRIVATE_KEY_MESSAGE,
    },
    {
      condition: 'USER_JWT_PRIVATE_KEY is an EC key, which is the wrong key type',
      variable: 'USER_JWT_PRIVATE_KEY',
      value: () => encodeKeyForEnvironment(generateEcKeyPair().privateKeyPem),
      message: USER_PRIVATE_KEY_MESSAGE,
    },
    {
      condition: 'USER_JWT_PRIVATE_KEY holds a public key',
      variable: 'USER_JWT_PRIVATE_KEY',
      value: () => encodeKeyForEnvironment(keys.user.publicKeyPem),
      message: USER_PRIVATE_KEY_MESSAGE,
    },
  ])(
    'should reject the config and name only the variable when $condition',
    ({ variable, value, message }) => {
      const source: Record<string, string | undefined> = { ...validSource, [variable]: value() };

      expect(() => parseConfig(UserJwtSigningConfigSchema, source)).toThrow(
        new Error(`Invalid configuration: ${variable}: ${message}`),
      );
    },
  );
});
