import { Role } from '@dexa/contracts';
import {
  isRetryOfStoredRequest,
  type ProvisioningRequestFields,
  type StoredProvisioningRequest,
} from './account-provisioning.rules.js';

const ACTOR_ACCOUNT_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';
const OTHER_ACTOR_ACCOUNT_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

const STORED: StoredProvisioningRequest = {
  actorAccountId: ACTOR_ACCOUNT_ID,
  requestedEmail: 'new.hire@dexa.test',
  requestedRole: Role.EMPLOYEE,
};

const SAME_REQUEST: ProvisioningRequestFields = {
  actorAccountId: ACTOR_ACCOUNT_ID,
  email: 'new.hire@dexa.test',
  role: Role.EMPLOYEE,
};

describe('isRetryOfStoredRequest', () => {
  it('should return true when every field matches and the password matches', () => {
    expect(isRetryOfStoredRequest(STORED, SAME_REQUEST, true)).toBe(true);
  });

  it.each([
    {
      condition: 'the password does not match the stored verifier',
      request: SAME_REQUEST,
      isPasswordMatching: false,
    },
    {
      condition: 'the actor differs',
      request: { ...SAME_REQUEST, actorAccountId: OTHER_ACTOR_ACCOUNT_ID },
      isPasswordMatching: true,
    },
    {
      condition: 'the email differs',
      request: { ...SAME_REQUEST, email: 'someone.else@dexa.test' },
      isPasswordMatching: true,
    },
    {
      condition: 'the role differs',
      request: { ...SAME_REQUEST, role: Role.HR },
      isPasswordMatching: true,
    },
  ])('should return false when $condition', ({ request, isPasswordMatching }) => {
    expect(isRetryOfStoredRequest(STORED, request, isPasswordMatching)).toBe(false);
  });
});
