import { ProfileStatus, type UpdateEmployeeRequest } from '@dexa/contracts';
import type { LockedEmployeeProfile } from '../profile/employee-profile.writer.interface.js';
import type { EmployeeDetailRecord } from './employee-detail.reader.interface.js';
import {
  planEmployeeUpdate,
  requestsProfileChange,
  toChangedMasterReferences,
} from './employee-update.rules.js';

const POSITION_ID = '5a0c3c1e-7f43-4c55-9d2b-2d6f7f1f0e11';
const OTHER_POSITION_ID = '9d2c7e1a-3b4f-4a6e-8f2d-1c5b7a9e0f3d';
const ACTIVE_STATUS_ID = '8c2d4e6f-1a3b-4c5d-9e7f-0a1b2c3d4e5f';
const INACTIVE_STATUS_ID = '0b6f7c0e-4f3a-4d55-9d1e-7a2b3c4d5e6f';
const PHOTO_KEY = '3f1b2c4d-0a9e-4b8f-8c7d-6e5f4a3b2c1d.jpg';
const PHONE = '+6281234567890';
const OTHER_PHONE = '+6289876543210';

function storedProfile(overrides: Partial<LockedEmployeeProfile> = {}): LockedEmployeeProfile {
  return {
    accountId: '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13',
    name: 'Nadia Rahma',
    positionId: POSITION_ID,
    employeeStatusId: ACTIVE_STATUS_ID,
    phoneNumber: PHONE,
    photoKey: PHOTO_KEY,
    profileStatus: ProfileStatus.COMPLETE,
    ...overrides,
  };
}

function storedRecord(): EmployeeDetailRecord {
  return {
    accountId: '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13',
    name: 'Nadia Rahma',
    position: { id: POSITION_ID, code: 'FULLSTACK_DEVELOPER', name: 'Fullstack Developer' },
    employeeStatus: { id: ACTIVE_STATUS_ID, code: 'ACTIVE', name: 'Active' },
    phoneNumber: PHONE,
    profileStatus: ProfileStatus.COMPLETE,
  };
}

describe('planEmployeeUpdate', () => {
  it.each([
    {
      condition: 'the name differs',
      request: { name: 'Nadia R.' },
      changes: { name: 'Nadia R.' },
      changedFields: ['name'],
    },
    {
      condition: 'the position differs',
      request: { positionId: OTHER_POSITION_ID },
      changes: { positionId: OTHER_POSITION_ID },
      changedFields: ['position'],
    },
    {
      condition: 'the phone differs',
      request: { phoneNumber: OTHER_PHONE },
      changes: { phoneNumber: OTHER_PHONE },
      changedFields: ['phoneNumber'],
    },
    {
      condition: 'the status differs',
      request: { employeeStatusId: INACTIVE_STATUS_ID },
      changes: { employeeStatusId: INACTIVE_STATUS_ID },
      changedFields: ['employeeStatus'],
    },
  ])(
    'should plan only the changed column when $condition',
    ({ request, changes, changedFields }) => {
      expect(planEmployeeUpdate(storedProfile(), request)).toEqual({ changes, changedFields });
    },
  );

  it('should return undefined when every named field already holds its stored value', () => {
    expect(
      planEmployeeUpdate(storedProfile(), {
        name: 'Nadia Rahma',
        positionId: POSITION_ID,
        phoneNumber: PHONE,
        employeeStatusId: ACTIVE_STATUS_ID,
      }),
    ).toBeUndefined();
  });

  it('should take the other columns from the locked row, so a stored phone the request does not name is kept', () => {
    const plan = planEmployeeUpdate(storedProfile({ phoneNumber: OTHER_PHONE }), {
      name: 'Nadia R.',
    });

    expect(plan?.changes).toEqual({ name: 'Nadia R.' });
  });

  it('should report profileStatus and write it when clearing the phone makes the profile incomplete', () => {
    const plan = planEmployeeUpdate(storedProfile(), { phoneNumber: null });

    expect(plan).toEqual({
      changes: { phoneNumber: null, profileStatus: ProfileStatus.INCOMPLETE },
      changedFields: ['phoneNumber', 'profileStatus'],
    });
  });

  it('should report profileStatus and write it when a missing phone completes the profile', () => {
    const plan = planEmployeeUpdate(
      storedProfile({ phoneNumber: null, profileStatus: ProfileStatus.INCOMPLETE }),
      { phoneNumber: PHONE },
    );

    expect(plan).toEqual({
      changes: { phoneNumber: PHONE, profileStatus: ProfileStatus.COMPLETE },
      changedFields: ['phoneNumber', 'profileStatus'],
    });
  });

  it('should leave profileStatus out when the status change does not move completion', () => {
    const plan = planEmployeeUpdate(storedProfile(), { employeeStatusId: INACTIVE_STATUS_ID });

    expect(plan?.changes).not.toHaveProperty('profileStatus');
    expect(plan?.changedFields).toEqual(['employeeStatus']);
  });
});

describe('requestsProfileChange', () => {
  it('should return false when the request names only a password', () => {
    const request: UpdateEmployeeRequest = { newPassword: 'reset-pass-2' };

    expect(requestsProfileChange(request)).toBe(false);
  });

  it('should return true when the request names a profile field, even one that matches the stored value', () => {
    expect(requestsProfileChange({ name: 'Nadia Rahma' })).toBe(true);
  });
});

describe('toChangedMasterReferences', () => {
  it.each([
    {
      condition: 'the request keeps the stored position and status',
      request: { positionId: POSITION_ID, employeeStatusId: ACTIVE_STATUS_ID },
      expected: [],
    },
    {
      condition: 'the request changes only the position',
      request: { positionId: OTHER_POSITION_ID },
      expected: [{ field: 'positionId', optionId: OTHER_POSITION_ID }],
    },
    {
      condition: 'the request changes both references, with the position first',
      request: { positionId: OTHER_POSITION_ID, employeeStatusId: INACTIVE_STATUS_ID },
      expected: [
        { field: 'positionId', optionId: OTHER_POSITION_ID },
        { field: 'employeeStatusId', optionId: INACTIVE_STATUS_ID },
      ],
    },
    {
      condition: 'the request names neither reference',
      request: { name: 'Nadia R.' },
      expected: [],
    },
  ])('should list only the changed references when $condition', ({ request, expected }) => {
    expect(toChangedMasterReferences(storedRecord(), request)).toEqual(expected);
  });
});
