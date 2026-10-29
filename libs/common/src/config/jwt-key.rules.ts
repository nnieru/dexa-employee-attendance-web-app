import { Buffer } from 'node:buffer';
import { createPrivateKey, createPublicKey, type KeyObject } from 'node:crypto';

const MIN_RSA_MODULUS_BITS = 2048;
// OpenSSL's name for NIST P-256, the only curve that ES256 uses.
const P256_CURVE_NAME = 'prime256v1';
// Standard base64 with padding, which is what `base64` and scripts/generate-dev-keys.mjs write.
// Node's decoder skips characters it does not recognise instead of failing, so the shape is checked
// before decoding.
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
// Node derives a public key from a private-key PEM without complaint, so the PEM label is the only
// check that keeps private key material out of a public-key variable.
const PRIVATE_KEY_PEM_PATTERN = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/;

export type KeyVisibility = 'public' | 'private';

export type KeyRequirement = {
  readonly visibility: KeyVisibility;
  readonly description: string;
  readonly isAcceptable: (key: KeyObject) => boolean;
};

export const USER_PUBLIC_KEY_REQUIREMENT: KeyRequirement = {
  visibility: 'public',
  description: `RSA public key of at least ${MIN_RSA_MODULUS_BITS} bits`,
  isAcceptable: isRsaKeyOfMinimumSize,
};

export const USER_PRIVATE_KEY_REQUIREMENT: KeyRequirement = {
  visibility: 'private',
  description: `RSA private key of at least ${MIN_RSA_MODULUS_BITS} bits`,
  isAcceptable: isRsaKeyOfMinimumSize,
};

export const SERVICE_PUBLIC_KEY_REQUIREMENT: KeyRequirement = {
  visibility: 'public',
  description: 'EC P-256 public key',
  isAcceptable: isP256EcKey,
};

export const SERVICE_PRIVATE_KEY_REQUIREMENT: KeyRequirement = {
  visibility: 'private',
  description: 'EC P-256 private key',
  isAcceptable: isP256EcKey,
};

export function describeKeyRequirement(requirement: KeyRequirement): string {
  return `must be a base64-encoded PEM ${requirement.description}`;
}

/**
 * Returns the decoded PEM when the value is base64 of a key that meets the requirement, and undefined
 * otherwise. Callers report undefined by field name, so the value itself never reaches a message.
 */
export function readKeyPem(encoded: string, requirement: KeyRequirement): string | undefined {
  const pem = decodeBase64Pem(encoded);
  if (pem === undefined) return undefined;
  if (requirement.visibility === 'public' && PRIVATE_KEY_PEM_PATTERN.test(pem)) return undefined;
  const key = parseKey(pem, requirement.visibility);
  if (key === undefined || !requirement.isAcceptable(key)) return undefined;
  return pem;
}

/**
 * True when the private key derives the configured public key. The comparison uses DER, so the
 * line layout of the PEM text does not matter.
 */
export function isMatchingKeyPair(privatePem: string, publicPem: string): boolean {
  const derivedPublicDer = createPublicKey(privatePem).export({ type: 'spki', format: 'der' });
  const publicDer = createPublicKey(publicPem).export({ type: 'spki', format: 'der' });
  return derivedPublicDer.equals(publicDer);
}

function decodeBase64Pem(encoded: string): string | undefined {
  if (encoded.length === 0 || !BASE64_PATTERN.test(encoded)) return undefined;
  return Buffer.from(encoded, 'base64').toString('utf8');
}

// Node reports malformed key material by throwing. The caller turns the undefined result into a
// configuration issue that names the field, so the text of the error is not needed.
function parseKey(pem: string, visibility: KeyVisibility): KeyObject | undefined {
  try {
    return visibility === 'public' ? createPublicKey(pem) : createPrivateKey(pem);
  } catch {
    return undefined;
  }
}

function isRsaKeyOfMinimumSize(key: KeyObject): boolean {
  const modulusLength = key.asymmetricKeyDetails?.modulusLength;
  return (
    key.asymmetricKeyType === 'rsa' &&
    modulusLength !== undefined &&
    modulusLength >= MIN_RSA_MODULUS_BITS
  );
}

function isP256EcKey(key: KeyObject): boolean {
  return key.asymmetricKeyType === 'ec' && key.asymmetricKeyDetails?.namedCurve === P256_CURVE_NAME;
}
