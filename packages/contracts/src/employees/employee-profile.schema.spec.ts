import { ProfileStatus } from './profile-status.js';
import { ownProfileSchema } from './employee-profile.schema.js';

const OWN_PROFILE = {
  accountId: '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13',
  name: 'Nadia Rahma',
  email: 'nadia.rahma@dexa.test',
  position: { code: 'FULLSTACK_DEVELOPER', name: 'Fullstack Developer' },
  phoneNumber: '+6281234567890',
  photoUrl: '/api/v1/employees/me/photo',
  profileStatus: ProfileStatus.COMPLETE,
};

describe('ownProfileSchema', () => {
  it('should accept the profile when every field is present and well formed', () => {
    expect(ownProfileSchema.parse(OWN_PROFILE)).toEqual(OWN_PROFILE);
  });

  it('should accept the profile when the phone number and photo URL are null', () => {
    const profile = {
      ...OWN_PROFILE,
      phoneNumber: null,
      photoUrl: null,
      profileStatus: 'INCOMPLETE',
    };

    expect(ownProfileSchema.parse(profile)).toEqual(profile);
  });

  it.each([
    { condition: 'the email is not an address', body: { ...OWN_PROFILE, email: 'nadia' } },
    { condition: 'the account ID is not a UUID', body: { ...OWN_PROFILE, accountId: 'me' } },
    { condition: 'the position is missing', body: { ...OWN_PROFILE, position: undefined } },
    {
      condition: 'the profile status is not a known code',
      body: { ...OWN_PROFILE, profileStatus: 'PENDING' },
    },
    { condition: 'the name is empty', body: { ...OWN_PROFILE, name: '' } },
  ])('should reject the profile when $condition', ({ body }) => {
    expect(ownProfileSchema.safeParse(body).success).toBe(false);
  });

  it('should strip credential and storage fields that a reader might pass through', () => {
    const parsed = ownProfileSchema.parse({
      ...OWN_PROFILE,
      passwordHash: '$argon2id$secret',
      photoKey: '3f1b2c4d-0a9e-4b8f-8c7d-6e5f4a3b2c1d.jpg',
    });

    expect(Object.keys(parsed).sort()).toEqual(Object.keys(OWN_PROFILE).sort());
  });
});
