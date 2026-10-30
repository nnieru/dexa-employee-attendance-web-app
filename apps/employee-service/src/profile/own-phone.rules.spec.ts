import { ProfileStatus } from '@dexa/contracts';
import type { LockedEmployeeProfile } from './employee-profile.writer.interface.js';
import { planOwnPhoneChange } from './own-phone.rules.js';

const PHOTO_KEY = '3f1b2c4d-0a9e-4b8f-8c7d-6e5f4a3b2c1d.jpg';
const PHONE = '+6281234567890';

function storedProfile(overrides: Partial<LockedEmployeeProfile>): LockedEmployeeProfile {
  return {
    accountId: '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13',
    name: 'Nadia Rahma',
    positionId: '5a0c3c1e-7f43-4c55-9d2b-2d6f7f1f0e11',
    employeeStatusId: '8c2d4e6f-1a3b-4c5d-9e7f-0a1b2c3d4e5f',
    phoneNumber: null,
    photoKey: null,
    profileStatus: ProfileStatus.INCOMPLETE,
    ...overrides,
  };
}

describe('planOwnPhoneChange', () => {
  it.each([
    {
      condition: 'the phone is unchanged and the profile is incomplete',
      stored: storedProfile({ phoneNumber: PHONE }),
      phoneNumber: PHONE,
    },
    {
      condition: 'both the stored and requested phone are null',
      stored: storedProfile({}),
      phoneNumber: null,
    },
    {
      condition: 'the phone is unchanged and the profile is complete',
      stored: storedProfile({
        phoneNumber: PHONE,
        photoKey: PHOTO_KEY,
        profileStatus: ProfileStatus.COMPLETE,
      }),
      phoneNumber: PHONE,
    },
  ])('should plan no write when $condition', ({ stored, phoneNumber }) => {
    expect(planOwnPhoneChange(stored, phoneNumber)).toBeUndefined();
  });

  it.each([
    {
      condition: 'a phone is added to a profile without a photo',
      stored: storedProfile({}),
      phoneNumber: PHONE,
      expected: { profileStatus: ProfileStatus.INCOMPLETE, changedFields: ['phoneNumber'] },
    },
    {
      condition: 'a phone is added to a profile that has a photo',
      stored: storedProfile({ photoKey: PHOTO_KEY }),
      phoneNumber: PHONE,
      expected: {
        profileStatus: ProfileStatus.COMPLETE,
        changedFields: ['phoneNumber', 'profileStatus'],
      },
    },
    {
      condition: 'the phone is cleared from a complete profile',
      stored: storedProfile({
        phoneNumber: PHONE,
        photoKey: PHOTO_KEY,
        profileStatus: ProfileStatus.COMPLETE,
      }),
      phoneNumber: null,
      expected: {
        profileStatus: ProfileStatus.INCOMPLETE,
        changedFields: ['phoneNumber', 'profileStatus'],
      },
    },
    {
      condition: 'the phone is replaced on a complete profile',
      stored: storedProfile({
        phoneNumber: PHONE,
        photoKey: PHOTO_KEY,
        profileStatus: ProfileStatus.COMPLETE,
      }),
      phoneNumber: '081234567890',
      expected: { profileStatus: ProfileStatus.COMPLETE, changedFields: ['phoneNumber'] },
    },
  ])(
    'should plan the phone write and reported fields when $condition',
    ({ stored, phoneNumber, expected }) => {
      expect(planOwnPhoneChange(stored, phoneNumber)).toEqual({ phoneNumber, ...expected });
    },
  );
});
