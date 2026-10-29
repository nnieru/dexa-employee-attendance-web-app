import { Role } from '@dexa/contracts';
import { userJwtPayloadSchema } from './user-jwt-payload.schema.js';

const ACCOUNT_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';
const EXPIRY_SECONDS = 4_102_444_800;

describe('userJwtPayloadSchema', () => {
  it.each([Role.EMPLOYEE, Role.HR])(
    'should accept the claims when role is %s and sub is a UUID',
    (role) => {
      expect(
        userJwtPayloadSchema.safeParse({ sub: ACCOUNT_ID, role, exp: EXPIRY_SECONDS }).success,
      ).toBe(true);
    },
  );

  it.each([
    {
      condition: 'sub is not a UUID',
      claims: { sub: 'employee-1', role: Role.EMPLOYEE, exp: EXPIRY_SECONDS },
    },
    {
      condition: 'role is not a known role',
      claims: { sub: ACCOUNT_ID, role: 'ADMIN', exp: EXPIRY_SECONDS },
    },
    {
      condition: 'role is in the wrong case',
      claims: { sub: ACCOUNT_ID, role: 'hr', exp: EXPIRY_SECONDS },
    },
    { condition: 'role is missing', claims: { sub: ACCOUNT_ID, exp: EXPIRY_SECONDS } },
    { condition: 'exp is missing', claims: { sub: ACCOUNT_ID, role: Role.HR } },
  ])('should reject the claims when $condition', ({ claims }) => {
    expect(userJwtPayloadSchema.safeParse(claims).success).toBe(false);
  });
});
