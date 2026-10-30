import {
  employeeProfileUpdatedPayloadSchema,
  PROFILE_FIELDS,
} from './employee-profile-updated.schema.js';

const ACCOUNT_ID = '9b1e4c7d-2f3a-4e5b-8c6d-1a2b3c4d5e6f';
const ACTOR_ACCOUNT_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';

const VALID_PAYLOAD = {
  accountId: ACCOUNT_ID,
  actorAccountId: ACTOR_ACCOUNT_ID,
  employeeName: 'Dewi Lestari',
  changedFields: ['phoneNumber'],
};

describe('employeeProfileUpdatedPayloadSchema', () => {
  it.each(PROFILE_FIELDS.map((field) => ({ field })))(
    'should accept the payload when changedFields holds $field',
    ({ field }) => {
      const parsed = employeeProfileUpdatedPayloadSchema.safeParse({
        ...VALID_PAYLOAD,
        changedFields: [field],
      });

      expect(parsed.success).toBe(true);
    },
  );

  it('should accept the payload when changedFields lists every profile field once', () => {
    const parsed = employeeProfileUpdatedPayloadSchema.safeParse({
      ...VALID_PAYLOAD,
      changedFields: [...PROFILE_FIELDS],
    });

    expect(parsed.success).toBe(true);
  });

  it.each([
    { condition: 'a password key is present', extra: { password: 'new-pass-123' } },
    { condition: 'a passwordHash key is present', extra: { passwordHash: '$argon2id$v=19' } },
    { condition: 'an oldValues key is present', extra: { oldValues: { phoneNumber: '0811' } } },
    { condition: 'a newValues key is present', extra: { newValues: { phoneNumber: '0822' } } },
  ])('should reject the payload when $condition', ({ extra }) => {
    expect(
      employeeProfileUpdatedPayloadSchema.safeParse({ ...VALID_PAYLOAD, ...extra }).success,
    ).toBe(false);
  });

  it.each([
    { condition: 'changedFields is empty', changedFields: [] },
    { condition: 'changedFields holds an unknown field name', changedFields: ['email'] },
    {
      condition: 'changedFields holds a value instead of a name',
      changedFields: ['0811-555-0100'],
    },
    {
      condition: 'changedFields repeats a field name',
      changedFields: ['phoneNumber', 'phoneNumber'],
    },
  ])('should reject the payload when $condition', ({ changedFields }) => {
    expect(
      employeeProfileUpdatedPayloadSchema.safeParse({ ...VALID_PAYLOAD, changedFields }).success,
    ).toBe(false);
  });

  it.each([
    { condition: 'accountId is not a UUID', body: { ...VALID_PAYLOAD, accountId: 'acc-1' } },
    {
      condition: 'actorAccountId is not a UUID',
      body: { ...VALID_PAYLOAD, actorAccountId: 'hr' },
    },
    { condition: 'employeeName is blank', body: { ...VALID_PAYLOAD, employeeName: '   ' } },
    {
      condition: 'employeeName is longer than 150 characters',
      body: { ...VALID_PAYLOAD, employeeName: 'a'.repeat(151) },
    },
    { condition: 'employeeName is missing', body: { ...VALID_PAYLOAD, employeeName: undefined } },
  ])('should reject the payload when $condition', ({ body }) => {
    expect(employeeProfileUpdatedPayloadSchema.safeParse(body).success).toBe(false);
  });

  it('should return the employee name trimmed when the name has surrounding spaces', () => {
    const parsed = employeeProfileUpdatedPayloadSchema.parse({
      ...VALID_PAYLOAD,
      employeeName: '  Dewi Lestari  ',
    });

    expect(parsed.employeeName).toBe('Dewi Lestari');
  });
});
