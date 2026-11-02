import { Buffer } from 'node:buffer';
import { createSign } from 'node:crypto';
import { ServiceName } from '@dexa/common';
import type { Role } from '@dexa/contracts';
import { servicePair, type AuthKeySet } from './auth-key-set.js';

const GATEWAY = ServiceName.API_GATEWAY;
const TOKEN_LIFETIME_SECONDS = 60;

function encodeJsonSegment(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

// Signs an ES256 token with one service's private key. The kid names the key's owner, as the real signer does.
function signWithServiceKey(
  keys: AuthKeySet,
  signingService: ServiceName,
  kid: ServiceName,
  claims: object,
): string {
  const signingInput = [
    encodeJsonSegment({ alg: 'ES256', typ: 'JWT', kid }),
    encodeJsonSegment(claims),
  ].join('.');
  const signature = createSign('SHA256')
    .update(signingInput)
    .sign(
      { key: servicePair(keys, signingService).privateKeyPem, dsaEncoding: 'ieee-p1363' },
      'base64url',
    );
  return `${signingInput}.${signature}`;
}

function gatewayUserClaims(
  target: ServiceName,
  accountId: string,
  role: Role,
  expiresAtSeconds: number,
) {
  return {
    iss: GATEWAY,
    sub: GATEWAY,
    aud: target,
    // The real signer always sets iat, and the guard caps exp - iat at the token lifetime.
    iat: expiresAtSeconds - TOKEN_LIFETIME_SECONDS,
    exp: expiresAtSeconds,
    user: { accountId, role },
  };
}

/**
 * Signs the token that api-gateway sends to one target service for a call made on behalf of a user: ES256 with
 * the gateway's key, kid and issuer = api-gateway, audience = the target, and the user claim. Only the gateway holds
 * that key in production, so a test that signs here plays the gateway.
 */
export function signGatewayUserToken(
  keys: AuthKeySet,
  target: ServiceName,
  accountId: string,
  role: Role,
  expiresAtSeconds: number = nowInSeconds() + TOKEN_LIFETIME_SECONDS,
): string {
  return signWithServiceKey(
    keys,
    GATEWAY,
    GATEWAY,
    gatewayUserClaims(target, accountId, role, expiresAtSeconds),
  );
}

/**
 * Names api-gateway as the issuer and kid, but signs with employee-service's key. A service must refuse it, because
 * the key that the kid names does not verify it.
 */
export function forgeGatewayUserToken(
  keys: AuthKeySet,
  target: ServiceName,
  accountId: string,
  role: Role,
): string {
  return signWithServiceKey(
    keys,
    ServiceName.EMPLOYEE_SERVICE,
    GATEWAY,
    gatewayUserClaims(target, accountId, role, nowInSeconds() + TOKEN_LIFETIME_SECONDS),
  );
}

/**
 * Signs the end-user JWT that auth-service issues at sign-in (RS256). Only auth-service holds the key in production.
 * A service must refuse this token, because only api-gateway verifies end-user tokens.
 */
export function signEndUserJwt(keys: AuthKeySet, accountId: string, role: Role): string {
  const signingInput = [
    encodeJsonSegment({ alg: 'RS256', typ: 'JWT' }),
    encodeJsonSegment({
      sub: accountId,
      role,
      iss: 'auth-service',
      aud: 'dexa-api',
      exp: nowInSeconds() + TOKEN_LIFETIME_SECONDS,
    }),
  ].join('.');
  const signature = createSign('RSA-SHA256')
    .update(signingInput)
    .sign(keys.user.privateKeyPem, 'base64url');
  return `${signingInput}.${signature}`;
}
