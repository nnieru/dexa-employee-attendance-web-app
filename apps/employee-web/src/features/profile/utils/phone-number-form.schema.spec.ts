import { describe, expect, it } from 'vitest';
import { phoneNumberFormSchema, toUpdateOwnProfileRequest } from './phone-number-form.schema.js';

describe('phoneNumberFormSchema', () => {
  it.each([
    { condition: 'the number has a leading plus', phoneNumber: '+6281234567890' },
    { condition: 'the number starts with a zero', phoneNumber: '081234567890' },
    { condition: 'the number has outer spaces', phoneNumber: '  +6281234567890  ' },
    { condition: 'the field is empty to clear the number', phoneNumber: '' },
  ])('should accept the form when $condition', ({ phoneNumber }) => {
    expect(phoneNumberFormSchema.safeParse({ phoneNumber }).success).toBe(true);
  });

  it.each([
    { condition: 'the number has seven digits', phoneNumber: '1234567' },
    { condition: 'the number has sixteen digits', phoneNumber: '1234567890123456' },
    { condition: 'the number contains letters', phoneNumber: '+62812abc' },
    { condition: 'the number is whitespace only', phoneNumber: '   ' },
  ])('should reject the form when $condition', ({ phoneNumber }) => {
    expect(phoneNumberFormSchema.safeParse({ phoneNumber }).success).toBe(false);
  });
});

describe('toUpdateOwnProfileRequest', () => {
  it('should send null to clear the number when the field is empty', () => {
    expect(toUpdateOwnProfileRequest({ phoneNumber: '' })).toEqual({ phoneNumber: null });
  });

  it('should send the trimmed number when the field has a value', () => {
    expect(toUpdateOwnProfileRequest({ phoneNumber: '+6281234567890' })).toEqual({
      phoneNumber: '+6281234567890',
    });
  });
});
