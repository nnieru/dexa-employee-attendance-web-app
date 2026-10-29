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
});
