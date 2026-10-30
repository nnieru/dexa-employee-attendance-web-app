import { createEmployeeRequestSchema, EMPLOYEE_NAME_MAX_LENGTH } from './create-employee.schema.js';

const VALID_REQUEST = {
  operationId: '0b6f7c0e-4f3a-4d55-9d1e-7a2b3c4d5e6f',
  name: '  Nadia Rahma  ',
  email: '  Nadia.Rahma@Dexa.Test ',
  positionId: '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13',
  employeeStatusId: '7a1d2e3f-4b5c-4d6e-8f70-1a2b3c4d5e6f',
  phoneNumber: ' +6281234567890 ',
  role: 'EMPLOYEE',
  initialPassword: 'initial-pass-1',
};

describe('createEmployeeRequestSchema', () => {
  it('should trim the name and phone and lowercase the email when the request is valid', () => {
    expect(createEmployeeRequestSchema.parse(VALID_REQUEST)).toEqual({
      ...VALID_REQUEST,
      name: 'Nadia Rahma',
      email: 'nadia.rahma@dexa.test',
      phoneNumber: '+6281234567890',
    });
  });

  it('should accept a null phone number when the employee has none yet', () => {
    expect(
      createEmployeeRequestSchema.safeParse({ ...VALID_REQUEST, phoneNumber: null }).success,
    ).toBe(true);
  });

  it('should accept the HR role when HR accounts are created (D-16)', () => {
    expect(createEmployeeRequestSchema.safeParse({ ...VALID_REQUEST, role: 'HR' }).success).toBe(
      true,
    );
  });

  it.each([
    { condition: 'the operation ID is not a UUID', patch: { operationId: 'op-1' } },
    { condition: 'the name is blank', patch: { name: '   ' } },
    {
      condition: 'the name is over the limit',
      patch: { name: 'a'.repeat(EMPLOYEE_NAME_MAX_LENGTH + 1) },
    },
    { condition: 'the email is not an address', patch: { email: 'nadia' } },
    { condition: 'the position ID is not a UUID', patch: { positionId: 'position' } },
    { condition: 'the status ID is not a UUID', patch: { employeeStatusId: 'active' } },
    { condition: 'the phone number is not a phone number', patch: { phoneNumber: 'call me' } },
    { condition: 'the phone key is missing', patch: { phoneNumber: undefined } },
    { condition: 'the role is not a provisionable role', patch: { role: 'ADMIN' } },
    { condition: 'the password has no digit', patch: { initialPassword: 'password-only' } },
  ])('should reject the request when $condition', ({ patch }) => {
    expect(createEmployeeRequestSchema.safeParse({ ...VALID_REQUEST, ...patch }).success).toBe(
      false,
    );
  });

  it.each([
    { condition: 'a profile status is sent', extra: { profileStatus: 'COMPLETE' } },
    {
      condition: 'an account ID is sent',
      extra: { accountId: '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13' },
    },
  ])('should reject the request when $condition', ({ extra }) => {
    expect(createEmployeeRequestSchema.safeParse({ ...VALID_REQUEST, ...extra }).success).toBe(
      false,
    );
  });
});
