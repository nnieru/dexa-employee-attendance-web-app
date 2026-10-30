import { ProfileStatus } from '@dexa/contracts';
import type { LockedEmployeeProfile } from '../profile/employee-profile.writer.interface.js';
import { planOwnPhotoChange } from './own-photo.rules.js';

const PHOTO_KEY = '3f1b2c4d-0a9e-4b8f-8c7d-6e5f4a3b2c1d.jpg';
const POSITION_ID = '9d2c7e1a-3b4f-4a6e-8f2d-1c5b7a9e0f3d';

function storedProfile(overrides: Partial<LockedEmployeeProfile>): LockedEmployeeProfile {
  return {
    accountId: '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13',
    name: 'Nadia Rahma',
    positionId: POSITION_ID,
    phoneNumber: null,
    photoKey: null,
    profileStatus: ProfileStatus.INCOMPLETE,
    ...overrides,
  };
}

describe('planOwnPhotoChange', () => {
  it.each([
    {
      condition: 'the profile has no phone, so the photo does not complete it',
      stored: storedProfile({ phoneNumber: null, profileStatus: ProfileStatus.INCOMPLETE }),
      expectedStatus: ProfileStatus.INCOMPLETE,
      expectedFields: ['photo'],
    },
    {
      condition: 'the profile has a phone and no photo, so the photo completes it',
      stored: storedProfile({
        phoneNumber: '+6281234567890',
        profileStatus: ProfileStatus.INCOMPLETE,
      }),
      expectedStatus: ProfileStatus.COMPLETE,
      expectedFields: ['photo', 'profileStatus'],
    },
    {
      condition: 'the profile is already complete and only its photo is replaced',
      stored: storedProfile({
        phoneNumber: '+6281234567890',
        photoKey: '0b6f1d2e-4c3a-4f5b-9e8d-7a6c5b4e3d2f.jpg',
        profileStatus: ProfileStatus.COMPLETE,
      }),
      expectedStatus: ProfileStatus.COMPLETE,
      expectedFields: ['photo'],
    },
  ])(
    'should report $expectedFields and the status when $condition',
    ({ stored, expectedStatus, expectedFields }) => {
      const plan = planOwnPhotoChange(stored, PHOTO_KEY);

      expect(plan.profileStatus).toBe(expectedStatus);
      expect(plan.changedFields).toEqual(expectedFields);
    },
  );
});
