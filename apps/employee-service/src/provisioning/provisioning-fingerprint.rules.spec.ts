import {
  calculateProvisioningFingerprint,
  type ProvisioningFingerprintFields,
} from './provisioning-fingerprint.rules.js';

const FIELDS: ProvisioningFingerprintFields = {
  email: 'nadia.rahma@dexa.test',
  name: 'Nadia Rahma',
  positionId: '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13',
  employeeStatusId: '7a1d2e3f-4b5c-4d6e-8f70-1a2b3c4d5e6f',
  phoneNumber: '+6281234567890',
};

describe('calculateProvisioningFingerprint', () => {
  it('should return a lowercase 64-character hex digest', () => {
    expect(calculateProvisioningFingerprint(FIELDS)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should return the same digest when the fields are given in another key order', () => {
    const reordered: ProvisioningFingerprintFields = {
      phoneNumber: FIELDS.phoneNumber,
      employeeStatusId: FIELDS.employeeStatusId,
      positionId: FIELDS.positionId,
      name: FIELDS.name,
      email: FIELDS.email,
    };

    expect(calculateProvisioningFingerprint(reordered)).toBe(
      calculateProvisioningFingerprint(FIELDS),
    );
  });

  it.each([
    {
      condition: 'the email differs in case and surrounding spaces',
      patch: { email: '  Nadia.Rahma@DEXA.test ' },
    },
    { condition: 'the name has surrounding spaces', patch: { name: '  Nadia Rahma  ' } },
    {
      condition: 'the phone number has surrounding spaces',
      patch: { phoneNumber: ' +6281234567890 ' },
    },
  ])('should return the same digest when $condition', ({ patch }) => {
    expect(calculateProvisioningFingerprint({ ...FIELDS, ...patch })).toBe(
      calculateProvisioningFingerprint(FIELDS),
    );
  });

  it.each([
    { condition: 'the name changes', patch: { name: 'Nadia R.' } },
    {
      condition: 'the position changes',
      patch: { positionId: '0b6f7c0e-4f3a-4d55-9d1e-7a2b3c4d5e6f' },
    },
    {
      condition: 'the employee status changes',
      patch: { employeeStatusId: '0b6f7c0e-4f3a-4d55-9d1e-7a2b3c4d5e6f' },
    },
    { condition: 'the phone number changes', patch: { phoneNumber: '+6281234500000' } },
    { condition: 'the phone number is removed', patch: { phoneNumber: null } },
    { condition: 'the email changes', patch: { email: 'nadia.r@dexa.test' } },
  ])('should return a different digest when $condition', ({ patch }) => {
    expect(calculateProvisioningFingerprint({ ...FIELDS, ...patch })).not.toBe(
      calculateProvisioningFingerprint(FIELDS),
    );
  });

  it('should ignore a password that is carried next to the fields', () => {
    const withPassword = { ...FIELDS, initialPassword: 'initial-pass-1' };

    expect(calculateProvisioningFingerprint(withPassword)).toBe(
      calculateProvisioningFingerprint(FIELDS),
    );
  });
});
