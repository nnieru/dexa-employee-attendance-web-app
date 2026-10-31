import { ServiceName } from '@dexa/common';
import { Buffer } from 'node:buffer';
import { generateKeyPairSync } from 'node:crypto';

// Copied from apps/api-gateway/test/auth-key-set.ts, which mirrors libs/common/test/auth-key-set.ts, so
// that this service's tests do not import another package's test folder. Test-only key material,
// generated when a test asks for it, so no key is stored in the repository.

const RSA_MODULUS_BITS = 2048;
const P256_CURVE_NAME = 'prime256v1';

export type PemKeyPair = {
  readonly privateKeyPem: string;
  readonly publicKeyPem: string;
};

export type AuthKeySet = {
  readonly user: PemKeyPair;
  readonly services: ReadonlyMap<ServiceName, PemKeyPair>;
};

export function generateRsaKeyPair(modulusLength: number = RSA_MODULUS_BITS): PemKeyPair {
  const pair = generateKeyPairSync('rsa', {
    modulusLength,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { privateKeyPem: pair.privateKey, publicKeyPem: pair.publicKey };
}

export function generateEcKeyPair(namedCurve: string = P256_CURVE_NAME): PemKeyPair {
  const pair = generateKeyPairSync('ec', {
    namedCurve,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { privateKeyPem: pair.privateKey, publicKeyPem: pair.publicKey };
}

/** One user key pair and one EC P-256 pair for every service name. */
export function generateAuthKeySet(): AuthKeySet {
  const serviceEntries = Object.values(ServiceName).map(
    (serviceName) => [serviceName, generateEcKeyPair()] as const,
  );
  return {
    user: generateRsaKeyPair(),
    services: new Map<ServiceName, PemKeyPair>(serviceEntries),
  };
}

export function servicePair(keys: AuthKeySet, serviceName: ServiceName): PemKeyPair {
  const pair = keys.services.get(serviceName);
  if (pair === undefined) throw new Error(`No test key pair was generated for ${serviceName}.`);
  return pair;
}

// Keys reach the environment base64-encoded, so the line breaks inside a PEM fit on one line.
export function encodeKeyForEnvironment(pem: string): string {
  return Buffer.from(pem, 'utf8').toString('base64');
}

// Mirrors the variable name that libs/common derives from each service name.
function serviceJwtPublicKeyVariable(serviceName: ServiceName): string {
  return `${serviceName.replaceAll('-', '_').toUpperCase()}_SERVICE_JWT_PUBLIC_KEY`;
}

/** The service key settings one service starts with: its own private key and every service's public key. */
export function authEnvironmentFor(
  keys: AuthKeySet,
  serviceName: ServiceName,
): Record<string, string> {
  const environment: Record<string, string> = {
    SERVICE_NAME: serviceName,
    SERVICE_JWT_PRIVATE_KEY: encodeKeyForEnvironment(servicePair(keys, serviceName).privateKeyPem),
  };
  for (const name of Object.values(ServiceName)) {
    environment[serviceJwtPublicKeyVariable(name)] = encodeKeyForEnvironment(
      servicePair(keys, name).publicKeyPem,
    );
  }
  return environment;
}
