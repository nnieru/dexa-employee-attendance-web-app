// Prints a development set of the token keys that libs/common/src/config/auth-config.schema.ts
// reads: one RSA user key pair and one EC P-256 key pair per service. Each value is a base64-encoded
// PEM on one line, written as .env lines.
//
// For local development only. A shared or deployed environment takes its keys from its secret
// store, so this output must never be committed there or reused.

import { Buffer } from 'node:buffer';
import { generateKeyPairSync } from 'node:crypto';
import process from 'node:process';

// Must match ServiceName in libs/common/src/auth/service-name.ts. The variable prefix is the name in
// upper case with dashes replaced by underscores, the same rule as serviceJwtPublicKeyVariable.
const SERVICE_NAMES = [
  'api-gateway',
  'auth-service',
  'employee-service',
  'attendance-service',
  'notification-service',
  'audit-worker',
];

const RSA_MODULUS_BITS = 2048;
const P256_CURVE = 'prime256v1';
const DEVELOPMENT_KEYS_NOTICE =
  '# Development token keys. Local use only: never commit or deploy them.';

function encodeForEnvironment(pem) {
  return Buffer.from(pem, 'utf8').toString('base64');
}

function variablePrefix(serviceName) {
  return serviceName.replaceAll('-', '_').toUpperCase();
}

function generateRsaKeyPair() {
  return generateKeyPairSync('rsa', {
    modulusLength: RSA_MODULUS_BITS,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
}

function generateEcKeyPair() {
  return generateKeyPairSync('ec', {
    namedCurve: P256_CURVE,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
}

function buildEnvironmentLines() {
  const lines = [DEVELOPMENT_KEYS_NOTICE];
  const userKeys = generateRsaKeyPair();
  lines.push(`USER_JWT_PRIVATE_KEY=${encodeForEnvironment(userKeys.privateKey)}`);
  lines.push(`USER_JWT_PUBLIC_KEY=${encodeForEnvironment(userKeys.publicKey)}`);
  for (const serviceName of SERVICE_NAMES) {
    const prefix = variablePrefix(serviceName);
    const serviceKeys = generateEcKeyPair();
    lines.push(`${prefix}_SERVICE_JWT_PUBLIC_KEY=${encodeForEnvironment(serviceKeys.publicKey)}`);
    lines.push(`${prefix}_SERVICE_JWT_PRIVATE_KEY=${encodeForEnvironment(serviceKeys.privateKey)}`);
  }
  return lines;
}

process.stdout.write(`${buildEnvironmentLines().join('\n')}\n`);
