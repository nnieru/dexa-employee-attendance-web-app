import { employeeProvisioningIncompleteDetailsSchema } from './employee-provisioning-incomplete.schema.js';

const OPERATION_ID = '0b6f7c0e-4f3a-4d55-9d1e-7a2b3c4d5e6f';
const ACCOUNT_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';

describe('employeeProvisioningIncompleteDetailsSchema', () => {
  it('should parse the details without an account ID when the operation has no Auth account yet', () => {
    expect(
      employeeProvisioningIncompleteDetailsSchema.parse({
        operationId: OPERATION_ID,
        savedPhase: 'RESERVED',
      }),
    ).toEqual({ operationId: OPERATION_ID, savedPhase: 'RESERVED' });
  });

  it('should parse the details with the account ID once the profile is saved', () => {
    expect(
      employeeProvisioningIncompleteDetailsSchema.parse({
        operationId: OPERATION_ID,
        savedPhase: 'PROFILE_SAVED',
        accountId: ACCOUNT_ID,
      }),
    ).toEqual({ operationId: OPERATION_ID, savedPhase: 'PROFILE_SAVED', accountId: ACCOUNT_ID });
  });

  it.each([
    { condition: 'the phase is ACTIVE, which is never partial', savedPhase: 'ACTIVE' },
    { condition: 'the phase is not listed', savedPhase: 'DONE' },
  ])('should reject the details when $condition', ({ savedPhase }) => {
    expect(
      employeeProvisioningIncompleteDetailsSchema.safeParse({
        operationId: OPERATION_ID,
        savedPhase,
      }).success,
    ).toBe(false);
  });
});
