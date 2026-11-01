import { describe, expect, it } from 'vitest';
import { createEmployeeFormSchema } from './create-employee-form.schema.js';

const VALID_FORM_VALUES = {
  name: 'Sari Dewi',
  email: 'sari.dewi@dexa.test',
  positionId: '1d5f8c2b-4a6e-4b3c-8f7d-8e9a0b1c2d3e',
  employeeStatusId: '0c4e7b1a-3f5d-4a2b-9e6c-7d8f9a0b1c2d',
  phoneNumber: '',
  role: 'EMPLOYEE',
  initialPassword: 'correct-horse-1',
} as const;

describe('createEmployeeFormSchema phone number', () => {
  it.each([
    ['empty', '', true],
    ['digits with a leading zero', '081234567890', true],
    ['leading plus', '+628111111111', true],
    ['too short', '1234567', false],
    ['too long', '1234567890123456', false],
    ['letters', '08123abc', false],
  ])('should %s when the phone number is %j', (_label, phoneNumber, isAccepted) => {
    const result = createEmployeeFormSchema.safeParse({ ...VALID_FORM_VALUES, phoneNumber });

    expect(result.success).toBe(isAccepted);
  });
});

describe('createEmployeeFormSchema name', () => {
  it('should reject a blank name after trimming', () => {
    const result = createEmployeeFormSchema.safeParse({ ...VALID_FORM_VALUES, name: '   ' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Enter the employee name.');
  });
});
