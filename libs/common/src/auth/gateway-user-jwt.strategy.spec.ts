import { Buffer } from 'node:buffer';
import { UnauthorizedException } from '@nestjs/common';
import { Role } from '@dexa/contracts';
import { AuthConfigSchema, type AuthConfig } from '../config/auth-config.schema.js';
import { parseConfig } from '../config/parse-config.js';
import {
  authEnvironmentFor,
  generateAuthKeySet,
  type AuthKeySet,
} from '../../test/auth-key-set.js';
import {
  GATEWAY_TOKEN_CLOCK_SKEW_SECONDS,
  GatewayUserJwtStrategy,
  isWithinGatewayTokenLifetime,
} from './gateway-user-jwt.strategy.js';
import { SERVICE_TOKEN_LIFETIME_SECONDS } from './service-token.signer.js';
import { ServiceJwtStrategy } from './service-jwt.strategy.js';
import { ServiceName } from './service-name.js';

const ACCOUNT_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';
const EXPIRY_SECONDS = 4_102_444_800;

// The strategies read the kid from the header and the claims from the payload. The signature is checked by
// passport-jwt before validate runs, so these unit tests pass the claims straight to validate.
function requestWithToken(kid: string): { headers: { authorization: string } } {
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT', kid })).toString(
    'base64url',
  );
  return { headers: { authorization: `Bearer ${header}.e30.signature` } };
}

describe('GatewayUserJwtStrategy', () => {
  let keys: AuthKeySet;
  let config: AuthConfig;
  let strategy: GatewayUserJwtStrategy;

  beforeAll(() => {
    keys = generateAuthKeySet();
    config = parseConfig(AuthConfigSchema, authEnvironmentFor(keys, ServiceName.EMPLOYEE_SERVICE));
    strategy = new GatewayUserJwtStrategy(config);
  });

  function gatewayClaims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    const issuedAt = Math.floor(Date.now() / 1000);
    return {
      iss: ServiceName.API_GATEWAY,
      sub: ServiceName.API_GATEWAY,
      iat: issuedAt,
      exp: issuedAt + SERVICE_TOKEN_LIFETIME_SECONDS,
      user: { accountId: ACCOUNT_ID, role: Role.EMPLOYEE },
      ...overrides,
    };
  }

  it('should return the account ID and role when the gateway token carries a valid user', () => {
    const user = strategy.validate(requestWithToken(ServiceName.API_GATEWAY), gatewayClaims());

    expect(user).toEqual({ accountId: ACCOUNT_ID, role: Role.EMPLOYEE });
  });

  it.each([
    {
      condition: 'the token has no user claim',
      claims: gatewayClaims({ user: undefined }),
      kid: ServiceName.API_GATEWAY,
    },
    {
      condition: 'the user claim has a role that is not known',
      claims: gatewayClaims({ user: { accountId: ACCOUNT_ID, role: 'ADMIN' } }),
      kid: ServiceName.API_GATEWAY,
    },
    {
      condition: 'the header kid names another service than the issuer',
      claims: gatewayClaims(),
      kid: ServiceName.AUTH_SERVICE,
    },
    {
      condition: 'the issuer is another service',
      claims: gatewayClaims({ iss: ServiceName.AUTH_SERVICE, sub: ServiceName.AUTH_SERVICE }),
      kid: ServiceName.AUTH_SERVICE,
    },
    {
      condition: 'the expiry claim is missing',
      claims: {
        iss: ServiceName.API_GATEWAY,
        sub: ServiceName.API_GATEWAY,
        user: { accountId: ACCOUNT_ID, role: Role.HR },
      },
      kid: ServiceName.API_GATEWAY,
    },
    {
      condition: 'the issued-at claim is missing',
      claims: gatewayClaims({ iat: undefined }),
      kid: ServiceName.API_GATEWAY,
    },
    {
      condition: 'the token lives longer than the internal token lifetime',
      claims: gatewayClaims({ exp: EXPIRY_SECONDS }),
      kid: ServiceName.API_GATEWAY,
    },
  ])('should refuse with 401 when $condition', ({ claims, kid }) => {
    expect(() => strategy.validate(requestWithToken(kid), claims)).toThrow(UnauthorizedException);
  });
});

describe('isWithinGatewayTokenLifetime', () => {
  const NOW_SECONDS = 1_800_000_000;

  it.each([
    { condition: 'it lives exactly the lifetime', iat: NOW_SECONDS, exp: NOW_SECONDS + 60, expected: true },
    { condition: 'it lives one second longer', iat: NOW_SECONDS, exp: NOW_SECONDS + 61, expected: false },
    {
      condition: 'it was issued within the clock skew ahead of now',
      iat: NOW_SECONDS + GATEWAY_TOKEN_CLOCK_SKEW_SECONDS,
      exp: NOW_SECONDS + GATEWAY_TOKEN_CLOCK_SKEW_SECONDS + 60,
      expected: true,
    },
    {
      condition: 'it was issued beyond the clock skew ahead of now',
      iat: NOW_SECONDS + GATEWAY_TOKEN_CLOCK_SKEW_SECONDS + 1,
      exp: NOW_SECONDS + GATEWAY_TOKEN_CLOCK_SKEW_SECONDS + 61,
      expected: false,
    },
    { condition: 'iat is not a whole number', iat: 'soon', exp: NOW_SECONDS + 60, expected: false },
  ])('should return $expected when $condition', ({ iat, exp, expected }) => {
    expect(isWithinGatewayTokenLifetime({ iat, exp }, NOW_SECONDS)).toBe(expected);
  });
});

describe('ServiceJwtStrategy', () => {
  let keys: AuthKeySet;
  let strategy: ServiceJwtStrategy;

  beforeAll(() => {
    keys = generateAuthKeySet();
    const config = parseConfig(
      AuthConfigSchema,
      authEnvironmentFor(keys, ServiceName.EMPLOYEE_SERVICE),
    );
    strategy = new ServiceJwtStrategy(config);
  });

  it('should return the caller when the token carries no user', () => {
    const claims = {
      iss: ServiceName.API_GATEWAY,
      sub: ServiceName.API_GATEWAY,
      exp: EXPIRY_SECONDS,
    };

    expect(strategy.validate(requestWithToken(ServiceName.API_GATEWAY), claims)).toEqual({
      serviceName: ServiceName.API_GATEWAY,
    });
  });

  it('should refuse with 401 when the token carries a user, because a user credential is not a service credential', () => {
    const claims = {
      iss: ServiceName.API_GATEWAY,
      sub: ServiceName.API_GATEWAY,
      exp: EXPIRY_SECONDS,
      user: { accountId: ACCOUNT_ID, role: Role.HR },
    };

    expect(() => strategy.validate(requestWithToken(ServiceName.API_GATEWAY), claims)).toThrow(
      UnauthorizedException,
    );
  });
});
