import { EMPLOYEE_NAME_MAX_LENGTH } from './create-employee.schema.js';
import { updateEmployeeRequestSchema } from './update-employee.schema.js';

const POSITION_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';
const STATUS_ID = '7a1d2e3f-4b5c-4d6e-8f70-1a2b3c4d5e6f';

describe('updateEmployeeRequestSchema', () => {
  it.each([
    {
      condition: 'only the name is sent',
      body: { name: '  Nadia Rahma  ' },
      expected: { name: 'Nadia Rahma' },
    },
    {
      condition: 'only the position is sent',
      body: { positionId: POSITION_ID },
      expected: { positionId: POSITION_ID },
    },
    {
      condition: 'the phone number is cleared with null',
      body: { phoneNumber: null },
      expected: { phoneNumber: null },
    },
    {
      condition: 'the phone number is trimmed',
      body: { phoneNumber: ' +6281234567890 ' },
      expected: { phoneNumber: '+6281234567890' },
    },
    {
      condition: 'only the status is sent',
      body: { employeeStatusId: STATUS_ID },
      expected: { employeeStatusId: STATUS_ID },
    },
    {
      condition: 'only the password is sent',
      body: { newPassword: 'reset-pass-2' },
      expected: { newPassword: 'reset-pass-2' },
    },
  ])('should accept the request when $condition', ({ body, expected }) => {
    expect(updateEmployeeRequestSchema.parse(body)).toEqual(expected);
  });

  it.each([
    { condition: 'the body is empty', body: {} },
    { condition: 'every field is undefined', body: { name: undefined, positionId: undefined } },
  ])('should reject the request when $condition', ({ body }) => {
    expect(updateEmployeeRequestSchema.safeParse(body).success).toBe(false);
  });

  it.each([
    { condition: 'the name is blank', body: { name: '   ' } },
    {
      condition: 'the name is over the limit',
      body: { name: 'a'.repeat(EMPLOYEE_NAME_MAX_LENGTH + 1) },
    },
    { condition: 'the position is not a UUID', body: { positionId: 'position' } },
    { condition: 'the status is not a UUID', body: { employeeStatusId: 'inactive' } },
    { condition: 'the phone number is not a phone number', body: { phoneNumber: 'call me' } },
    { condition: 'the phone number is empty', body: { phoneNumber: '' } },
    { condition: 'the password has no digit', body: { newPassword: 'password-only' } },
  ])('should reject the request when $condition', ({ body }) => {
    expect(updateEmployeeRequestSchema.safeParse(body).success).toBe(false);
  });

  it.each([
    { condition: 'an account ID is sent', extra: { accountId: POSITION_ID } },
    { condition: 'a profile status is sent', extra: { profileStatus: 'COMPLETE' } },
    { condition: 'an email is sent', extra: { email: 'nadia.rahma@dexa.test' } },
    { condition: 'a role is sent', extra: { role: 'HR' } },
    { condition: 'a status code is sent instead of its ID', extra: { employeeStatus: 'INACTIVE' } },
  ])('should reject the request when $condition', ({ extra }) => {
    expect(updateEmployeeRequestSchema.safeParse({ name: 'Nadia Rahma', ...extra }).success).toBe(
      false,
    );
  });
});
