import { employeeDetailSchema } from './employee-detail.schema.js';

const VALID_DETAIL = {
  accountId: '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13',
  name: 'Nadia Rahma',
  email: 'nadia.rahma@dexa.test',
  role: 'EMPLOYEE',
  position: {
    id: '7a1d2e3f-4b5c-4d6e-8f70-1a2b3c4d5e6f',
    code: 'FULLSTACK_DEVELOPER',
    name: 'Fullstack Developer',
  },
  employeeStatus: { id: '0b6f7c0e-4f3a-4d55-9d1e-7a2b3c4d5e6f', code: 'ACTIVE', name: 'Active' },
  phoneNumber: null,
  profileStatus: 'INCOMPLETE',
};

describe('employeeDetailSchema', () => {
  it('should parse the detail when every field is present', () => {
    expect(employeeDetailSchema.parse(VALID_DETAIL)).toEqual(VALID_DETAIL);
  });

  it('should drop a stored secret field that a later version might add to the answer', () => {
    const parsed = employeeDetailSchema.parse({ ...VALID_DETAIL, passwordHash: 'hash' });

    expect(parsed).not.toHaveProperty('passwordHash');
  });

  it.each([
    { condition: 'the role is not listed', patch: { role: 'ADMIN' } },
    {
      condition: 'the position has no code',
      patch: { position: { id: VALID_DETAIL.position.id, name: 'x' } },
    },
    { condition: 'the profile status is not listed', patch: { profileStatus: 'PARTIAL' } },
    { condition: 'the email is not an address', patch: { email: 'nadia' } },
  ])('should reject the detail when $condition', ({ patch }) => {
    expect(employeeDetailSchema.safeParse({ ...VALID_DETAIL, ...patch }).success).toBe(false);
  });
});
