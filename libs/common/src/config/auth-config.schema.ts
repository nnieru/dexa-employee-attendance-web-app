import { z } from 'zod';
import { ServiceName, serviceNameSchema } from '../auth/service-name.js';
import {
  SERVICE_PRIVATE_KEY_REQUIREMENT,
  SERVICE_PUBLIC_KEY_REQUIREMENT,
  USER_PRIVATE_KEY_REQUIREMENT,
  USER_PUBLIC_KEY_REQUIREMENT,
  describeKeyRequirement,
  isMatchingKeyPair,
  readKeyPem,
  type KeyRequirement,
} from './jwt-key.rules.js';

/**
 * Service key settings after validation, read by every service. Keys are decoded PEM text, which
 * passport-jwt and @nestjs/jwt accept as they are, so no strategy or signer parses the environment again.
 */
export type AuthConfig = {
  readonly SERVICE_NAME: ServiceName;
  readonly SERVICE_JWT_PRIVATE_KEY: string;
  readonly SERVICE_JWT_PUBLIC_KEYS: ReadonlyMap<ServiceName, string>;
};

/** User token settings for verifying tokens. Only api-gateway reads them. */
export type UserJwtVerifierConfig = {
  readonly USER_JWT_ISSUER: string;
  readonly USER_JWT_AUDIENCE: string;
  readonly USER_JWT_PUBLIC_KEY: string;
};

/** User token settings for signing tokens. Only auth-service reads them. */
export type UserJwtSigningConfig = UserJwtVerifierConfig & {
  readonly USER_JWT_PRIVATE_KEY: string | undefined;
};

/**
 * The variable that holds a service's public key, derived from its name:
 * AUTH_SERVICE_SERVICE_JWT_PUBLIC_KEY. This is the only place that derives these names.
 */
export function serviceJwtPublicKeyVariable(serviceName: ServiceName): string {
  return `${serviceName.replaceAll('-', '_').toUpperCase()}_SERVICE_JWT_PUBLIC_KEY`;
}

// A blank variable counts as unset, so a copied .env file still starts a service that does not use it.
function treatBlankAsUnset(value: unknown): unknown {
  return value === '' ? undefined : value;
}

// The decoded PEM replaces the base64 text, so later steps only ever see validated key material.
function pemField(requirement: KeyRequirement) {
  const message = describeKeyRequirement(requirement);
  return z.string({ error: message }).transform((value, context) => {
    const pem = readKeyPem(value, requirement);
    if (pem !== undefined) return pem;
    context.addIssue({ code: 'custom', message });
    return z.NEVER;
  });
}

function readPemValue(value: unknown, requirement: KeyRequirement): string | undefined {
  return typeof value === 'string' ? readKeyPem(value, requirement) : undefined;
}

const serviceKeyEnvironmentSchema = z.looseObject({
  SERVICE_NAME: serviceNameSchema,
  SERVICE_JWT_PRIVATE_KEY: pemField(SERVICE_PRIVATE_KEY_REQUIREMENT),
});

type ServiceKeyEnvironment = z.infer<typeof serviceKeyEnvironmentSchema>;

// The per-service public keys and the key-pair check run here, not in the shape, because the
// service public key variables are derived from the service list. This step runs only after the
// fields above are valid, so a pair is never compared against a key that is itself broken.
export const AuthConfigSchema = serviceKeyEnvironmentSchema.transform(
  (environment, context) => buildAuthConfig(environment, context) ?? z.NEVER,
);

// Returns undefined only after adding at least one issue, which makes the parse fail.
function buildAuthConfig(
  environment: ServiceKeyEnvironment,
  context: z.RefinementCtx,
): AuthConfig | undefined {
  const servicePublicKeys = readServicePublicKeys(environment, context);
  if (servicePublicKeys === undefined) return undefined;
  if (!hasMatchingServiceKeyPair(environment, servicePublicKeys, context)) return undefined;
  return {
    SERVICE_NAME: environment.SERVICE_NAME,
    SERVICE_JWT_PRIVATE_KEY: environment.SERVICE_JWT_PRIVATE_KEY,
    SERVICE_JWT_PUBLIC_KEYS: servicePublicKeys,
  };
}

// Every service needs a usable public key, so each missing or invalid variable is reported. No map
// is returned unless all of them are usable.
function readServicePublicKeys(
  environment: ServiceKeyEnvironment,
  context: z.RefinementCtx,
): ReadonlyMap<ServiceName, string> | undefined {
  const publicKeys = new Map<ServiceName, string>();
  for (const serviceName of Object.values(ServiceName)) {
    const variable = serviceJwtPublicKeyVariable(serviceName);
    const pem = readPemValue(environment[variable], SERVICE_PUBLIC_KEY_REQUIREMENT);
    if (pem === undefined) {
      context.addIssue({
        code: 'custom',
        path: [variable],
        message: describeKeyRequirement(SERVICE_PUBLIC_KEY_REQUIREMENT),
      });
    } else {
      publicKeys.set(serviceName, pem);
    }
  }
  return publicKeys.size === Object.values(ServiceName).length ? publicKeys : undefined;
}

// A private key that does not match the public key it is paired with would sign tokens that no
// receiver accepts, so the mismatch fails at startup. The message names the variable to fix.
function hasMatchingServiceKeyPair(
  environment: ServiceKeyEnvironment,
  servicePublicKeys: ReadonlyMap<ServiceName, string>,
  context: z.RefinementCtx,
): boolean {
  const ownPublicKey = servicePublicKeys.get(environment.SERVICE_NAME);
  const isMatching =
    ownPublicKey !== undefined &&
    isMatchingKeyPair(environment.SERVICE_JWT_PRIVATE_KEY, ownPublicKey);
  if (!isMatching) {
    context.addIssue({
      code: 'custom',
      path: ['SERVICE_JWT_PRIVATE_KEY'],
      message: `must match ${serviceJwtPublicKeyVariable(environment.SERVICE_NAME)}`,
    });
  }
  return isMatching;
}

const userJwtVerifierEnvironmentSchema = z.looseObject({
  USER_JWT_ISSUER: z.string().min(1, 'must not be empty'),
  USER_JWT_AUDIENCE: z.string().min(1, 'must not be empty'),
  USER_JWT_PUBLIC_KEY: pemField(USER_PUBLIC_KEY_REQUIREMENT),
});

/** Settings a service needs to verify user tokens. Only api-gateway uses this schema. */
export const UserJwtVerifierConfigSchema = userJwtVerifierEnvironmentSchema.transform(
  (environment): UserJwtVerifierConfig => ({
    USER_JWT_ISSUER: environment.USER_JWT_ISSUER,
    USER_JWT_AUDIENCE: environment.USER_JWT_AUDIENCE,
    USER_JWT_PUBLIC_KEY: environment.USER_JWT_PUBLIC_KEY,
  }),
);

// Only auth-service signs user tokens. The private key is optional here so the schema can say which
// settings are missing; auth-service refuses a missing key in its own schema.
const userJwtSigningEnvironmentSchema = z.looseObject({
  USER_JWT_ISSUER: z.string().min(1, 'must not be empty'),
  USER_JWT_AUDIENCE: z.string().min(1, 'must not be empty'),
  USER_JWT_PUBLIC_KEY: pemField(USER_PUBLIC_KEY_REQUIREMENT),
  USER_JWT_PRIVATE_KEY: z.preprocess(
    treatBlankAsUnset,
    pemField(USER_PRIVATE_KEY_REQUIREMENT).optional(),
  ),
});

/** Settings a service needs to sign user tokens. Only auth-service uses this schema. */
export const UserJwtSigningConfigSchema = userJwtSigningEnvironmentSchema.transform(
  (environment, context): UserJwtSigningConfig => {
    const isMatching =
      environment.USER_JWT_PRIVATE_KEY === undefined ||
      isMatchingKeyPair(environment.USER_JWT_PRIVATE_KEY, environment.USER_JWT_PUBLIC_KEY);
    if (!isMatching) {
      context.addIssue({
        code: 'custom',
        path: ['USER_JWT_PRIVATE_KEY'],
        message: 'must match USER_JWT_PUBLIC_KEY',
      });
      return z.NEVER;
    }
    return {
      USER_JWT_ISSUER: environment.USER_JWT_ISSUER,
      USER_JWT_AUDIENCE: environment.USER_JWT_AUDIENCE,
      USER_JWT_PUBLIC_KEY: environment.USER_JWT_PUBLIC_KEY,
      USER_JWT_PRIVATE_KEY: environment.USER_JWT_PRIVATE_KEY,
    };
  },
);
