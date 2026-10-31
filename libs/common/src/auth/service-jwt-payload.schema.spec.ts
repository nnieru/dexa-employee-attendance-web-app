import { Role } from '@dexa/contracts';
import { serviceJwtPayloadSchema } from './service-jwt-payload.schema.js';
import { ServiceName } from './service-name.js';

const EXPIRY_SECONDS = 4_102_444_800;

describe('serviceJwtPayloadSchema', () => {
  it('should accept the claims when iss and sub match a known service and exp is present', () => {
    const claims = {
      iss: ServiceName.API_GATEWAY,
      sub: ServiceName.API_GATEWAY,
      exp: EXPIRY_SECONDS,
    };

    expect(serviceJwtPayloadSchema.safeParse(claims).success).toBe(true);
  });

  it.each([
    {
      condition: 'sub differs from iss',
      claims: { iss: ServiceName.API_GATEWAY, sub: ServiceName.AUTH_SERVICE, exp: EXPIRY_SECONDS },
    },
    {
      condition: 'iss is not a known service',
      claims: { iss: 'billing-service', sub: 'billing-service', exp: EXPIRY_SECONDS },
    },
    {
      condition: 'sub is not a known service',
      claims: { iss: ServiceName.API_GATEWAY, sub: 'unknown-caller', exp: EXPIRY_SECONDS },
    },
    {
      condition: 'exp is missing',
      claims: { iss: ServiceName.API_GATEWAY, sub: ServiceName.API_GATEWAY },
    },
  ])('should reject the claims when $condition', ({ claims }) => {
    expect(serviceJwtPayloadSchema.safeParse(claims).success).toBe(false);
  });

  it('should accept the claims when they carry a user with a UUID account ID and a known role', () => {
    const claims = {
      iss: ServiceName.API_GATEWAY,
      sub: ServiceName.API_GATEWAY,
      exp: EXPIRY_SECONDS,
      user: { accountId: '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13', role: Role.HR },
    };

    expect(serviceJwtPayloadSchema.safeParse(claims).success).toBe(true);
  });

  it.each([
    {
      condition: 'the user account ID is not a UUID',
      user: { accountId: 'account-1', role: Role.HR },
    },
    {
      condition: 'the user role is not a known role',
      user: { accountId: '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13', role: 'ADMIN' },
    },
    {
      condition: 'the user has no role',
      user: { accountId: '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13' },
    },
  ])('should reject the claims when $condition', ({ user }) => {
    const claims = {
      iss: ServiceName.API_GATEWAY,
      sub: ServiceName.API_GATEWAY,
      exp: EXPIRY_SECONDS,
      user,
    };

    expect(serviceJwtPayloadSchema.safeParse(claims).success).toBe(false);
  });
});
