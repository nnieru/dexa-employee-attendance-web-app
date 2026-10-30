import {
  accountProvisioningOperationSchema,
  accountProvisioningRequestSchema,
} from './account-provisioning.schema.js';
import { Role } from './role.js';

const OPERATION_ID = '0d7f2a51-3c4e-4b8a-9f16-7e2d5c9a1b30';
const ACTOR_ACCOUNT_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';
const ACCOUNT_ID = '9b1e4c7d-2f3a-4e5b-8c6d-1a2b3c4d5e6f';
const VALID_PASSWORD = 'new-hire-pass-1';

const VALID_REQUEST = {
  operationId: OPERATION_ID,
  actorAccountId: ACTOR_ACCOUNT_ID,
  email: 'new.hire@dexa.test',
  role: Role.EMPLOYEE,
  initialPassword: VALID_PASSWORD,
};

describe('accountProvisioningRequestSchema', () => {
  it('should return the email trimmed and lowercased when the request has mixed case and spaces', () => {
    const parsed = accountProvisioningRequestSchema.parse({
      ...VALID_REQUEST,
      email: '  New.Hire@Dexa.Test  ',
    });

    expect(parsed).toEqual(VALID_REQUEST);
  });

  it.each([Role.EMPLOYEE, Role.HR])('should accept the request when the role is %s', (role) => {
    expect(accountProvisioningRequestSchema.parse({ ...VALID_REQUEST, role }).role).toBe(role);
  });

  it.each([
    {
      condition: 'an unknown field is present',
      body: { ...VALID_REQUEST, accountId: ACCOUNT_ID },
    },
    { condition: 'the role is not EMPLOYEE or HR', body: { ...VALID_REQUEST, role: 'ADMIN' } },
    {
      condition: 'the operation ID is not a UUID',
      body: { ...VALID_REQUEST, operationId: 'op-1' },
    },
    { condition: 'the actor ID is not a UUID', body: { ...VALID_REQUEST, actorAccountId: 'hr' } },
    { condition: 'the email is not an address', body: { ...VALID_REQUEST, email: 'not-an-email' } },
    { condition: 'the password is too short', body: { ...VALID_REQUEST, initialPassword: 'abc1' } },
    {
      condition: 'the password has no digit',
      body: { ...VALID_REQUEST, initialPassword: 'password-only' },
    },
  ])('should reject the request when $condition', ({ body }) => {
    expect(accountProvisioningRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe('accountProvisioningOperationSchema', () => {
  it.each(['PENDING', 'ACTIVE'])('should accept the operation when its status is %s', (status) => {
    const parsed = accountProvisioningOperationSchema.parse({
      operationId: OPERATION_ID,
      accountId: ACCOUNT_ID,
      status,
    });

    expect(parsed.status).toBe(status);
  });

  it('should reject the operation when its status is not PENDING or ACTIVE', () => {
    const result = accountProvisioningOperationSchema.safeParse({
      operationId: OPERATION_ID,
      accountId: ACCOUNT_ID,
      status: 'CANCELLED',
    });

    expect(result.success).toBe(false);
  });
});
