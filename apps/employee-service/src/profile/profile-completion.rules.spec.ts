import { ProfileStatus, calculateProfileStatus } from './profile-completion.rules.js';

const COMPLETE_PROFILE = {
  name: 'Nadia Rahma',
  positionId: '5a0c3c1e-7f43-4c55-9d2b-2d6f7f1f0e11',
  phoneNumber: '+6281234567890',
  photoKey: '3f1b2c4d-0a9e-4b8f-8c7d-6e5f4a3b2c1d.jpg',
};

describe('calculateProfileStatus', () => {
  it('should return COMPLETE when name, position, phone number, and photo are all present', () => {
    expect(calculateProfileStatus(COMPLETE_PROFILE)).toBe(ProfileStatus.COMPLETE);
  });

  it.each([
    { condition: 'the phone number is missing', change: { phoneNumber: null } },
    { condition: 'the phone number is empty', change: { phoneNumber: '' } },
    { condition: 'the phone number is whitespace only', change: { phoneNumber: '   ' } },
    { condition: 'the photo is missing', change: { photoKey: null } },
    { condition: 'the photo key is whitespace only', change: { photoKey: ' \t' } },
    { condition: 'the name is whitespace only', change: { name: '  ' } },
    { condition: 'the position is empty', change: { positionId: '' } },
    {
      condition: 'both phone number and photo are missing',
      change: { phoneNumber: null, photoKey: null },
    },
  ])('should return INCOMPLETE when $condition', ({ change }) => {
    expect(calculateProfileStatus({ ...COMPLETE_PROFILE, ...change })).toBe(
      ProfileStatus.INCOMPLETE,
    );
  });
});
