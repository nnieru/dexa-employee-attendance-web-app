import { AccountProvisioningStatus } from '@dexa/contracts';
import { EmployeeProvisioningState } from './employee-provisioning-state.js';
import {
  isActivationConfirmed,
  isSameProvisioningRequest,
  needsActivation,
  needsProfileSave,
} from './employee-provisioning.rules.js';

const ACTOR_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';
const OTHER_ACTOR_ID = '7a1d2e3f-4b5c-4d6e-8f70-1a2b3c4d5e6f';
const ACCOUNT_ID = '0b6f7c0e-4f3a-4d55-9d1e-7a2b3c4d5e6f';
const FINGERPRINT = 'a'.repeat(64);
const OTHER_FINGERPRINT = 'b'.repeat(64);

describe('isSameProvisioningRequest', () => {
  it.each([
    {
      condition: 'the actor and the fingerprint both match',
      actorAccountId: ACTOR_ID,
      fingerprint: FINGERPRINT,
      expected: true,
    },
    {
      condition: 'another HR actor sent the same fields',
      actorAccountId: OTHER_ACTOR_ID,
      fingerprint: FINGERPRINT,
      expected: false,
    },
    {
      condition: 'the same actor sent different fields',
      actorAccountId: ACTOR_ID,
      fingerprint: OTHER_FINGERPRINT,
      expected: false,
    },
  ])('should return $expected when $condition', ({ actorAccountId, fingerprint, expected }) => {
    const stored = { actorAccountId: ACTOR_ID, requestFingerprintSha256: FINGERPRINT };

    expect(isSameProvisioningRequest(stored, actorAccountId, fingerprint)).toBe(expected);
  });
});

describe('provisioning phase transitions', () => {
  it.each([
    { state: EmployeeProvisioningState.RESERVED, saves: true, activates: true },
    { state: EmployeeProvisioningState.PROFILE_SAVED, saves: false, activates: true },
    { state: EmployeeProvisioningState.ACTIVE, saves: false, activates: false },
  ])(
    'should save the profile $saves and activate $activates when the operation is $state',
    ({ state, saves, activates }) => {
      expect(needsProfileSave(state)).toBe(saves);
      expect(needsActivation(state)).toBe(activates);
    },
  );
});

describe('isActivationConfirmed', () => {
  it.each([
    {
      condition: 'Auth reports this account as ACTIVE',
      answer: { status: AccountProvisioningStatus.ACTIVE, accountId: ACCOUNT_ID },
      expected: true,
    },
    {
      condition: 'Auth reports PENDING',
      answer: { status: AccountProvisioningStatus.PENDING, accountId: ACCOUNT_ID },
      expected: false,
    },
    {
      condition: 'Auth reports ACTIVE for another account',
      answer: { status: AccountProvisioningStatus.ACTIVE, accountId: OTHER_ACTOR_ID },
      expected: false,
    },
  ])('should return $expected when $condition', ({ answer, expected }) => {
    const operationId = '9c1e2d3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f';

    expect(isActivationConfirmed({ operationId, ...answer }, ACCOUNT_ID)).toBe(expected);
  });
});
