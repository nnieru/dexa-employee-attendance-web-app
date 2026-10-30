import { updateOwnProfileRequestSchema } from './update-own-profile.schema.js';

describe('updateOwnProfileRequestSchema', () => {
  it.each([
    {
      condition: 'the phone number has a leading plus',
      body: '+6281234567890',
      expected: '+6281234567890',
    },
    {
      condition: 'the phone number starts with a zero',
      body: '081234567890',
      expected: '081234567890',
    },
    {
      condition: 'the phone number has outer spaces',
      body: '  0812345678  ',
      expected: '0812345678',
    },
    { condition: 'the phone number is null', body: null, expected: null },
  ])(
    'should accept the request and store the trimmed phone number when $condition',
    ({ body, expected }) => {
      expect(updateOwnProfileRequestSchema.parse({ phoneNumber: body })).toEqual({
        phoneNumber: expected,
      });
    },
  );

  it.each([
    { condition: 'the phone number is empty', body: { phoneNumber: '' } },
    { condition: 'the phone number is whitespace only', body: { phoneNumber: '   ' } },
    { condition: 'the phone number has letters', body: { phoneNumber: 'abc' } },
    { condition: 'the phone number has too few digits', body: { phoneNumber: '+12' } },
    { condition: 'the phone number has 16 digits', body: { phoneNumber: '1234567890123456' } },
    { condition: 'the phone number has separators', body: { phoneNumber: '62-812-345' } },
    { condition: 'the phone number key is missing', body: {} },
    { condition: 'the phone number is a number', body: { phoneNumber: 81234567890 } },
  ])('should reject the request when $condition', ({ body }) => {
    expect(updateOwnProfileRequestSchema.safeParse(body).success).toBe(false);
  });

  it.each([
    { field: 'name', value: 'Nadia Rahma' },
    { field: 'email', value: 'nadia.rahma@dexa.test' },
    { field: 'positionId', value: '5a0c3c1e-7f43-4c55-9d2b-2d6f7f1f0e11' },
    { field: 'employeeStatusId', value: '5a0c3c1e-7f43-4c55-9d2b-2d6f7f1f0e12' },
    { field: 'profileStatus', value: 'COMPLETE' },
    { field: 'photoKey', value: '3f1b2c4d-0a9e-4b8f-8c7d-6e5f4a3b2c1d.jpg' },
  ])('should reject the request when the read-only field $field is present', ({ field, value }) => {
    const body = { phoneNumber: '+6281234567890', [field]: value };

    expect(updateOwnProfileRequestSchema.safeParse(body).success).toBe(false);
  });
});
