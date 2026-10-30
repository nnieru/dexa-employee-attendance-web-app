import { Portal, Role } from '@dexa/contracts';
import { findKnownRole, resolveSignInRole } from './login-eligibility.rules.js';

const ACTIVE_ACCOUNT = { isActive: true, isProvisioningPending: false };

describe('resolveSignInRole', () => {
  it.each([
    {
      condition: 'an active EMPLOYEE account signs in on the employee portal',
      candidate: { ...ACTIVE_ACCOUNT, roleCode: Role.EMPLOYEE },
      portal: Portal.EMPLOYEE,
      expected: Role.EMPLOYEE,
    },
    {
      condition: 'an active HR account signs in on the employee portal',
      candidate: { ...ACTIVE_ACCOUNT, roleCode: Role.HR },
      portal: Portal.EMPLOYEE,
      expected: Role.HR,
    },
    {
      condition: 'an active HR account signs in on the HR portal',
      candidate: { ...ACTIVE_ACCOUNT, roleCode: Role.HR },
      portal: Portal.HR,
      expected: Role.HR,
    },
    {
      condition: 'an active EMPLOYEE account tries the HR portal',
      candidate: { ...ACTIVE_ACCOUNT, roleCode: Role.EMPLOYEE },
      portal: Portal.HR,
      expected: undefined,
    },
    {
      condition: 'an inactive HR account tries the HR portal',
      candidate: { isActive: false, isProvisioningPending: false, roleCode: Role.HR },
      portal: Portal.HR,
      expected: undefined,
    },
    {
      condition: 'an inactive EMPLOYEE account tries the employee portal',
      candidate: { isActive: false, isProvisioningPending: false, roleCode: Role.EMPLOYEE },
      portal: Portal.EMPLOYEE,
      expected: undefined,
    },
    {
      condition: 'an EMPLOYEE account is still pending provisioning',
      candidate: { isActive: true, isProvisioningPending: true, roleCode: Role.EMPLOYEE },
      portal: Portal.EMPLOYEE,
      expected: undefined,
    },
    {
      condition: 'the stored role code is not a role that this service knows',
      candidate: { ...ACTIVE_ACCOUNT, roleCode: 'ADMIN' },
      portal: Portal.EMPLOYEE,
      expected: undefined,
    },
  ])('should resolve $expected when $condition', ({ candidate, portal, expected }) => {
    expect(resolveSignInRole(candidate, portal)).toBe(expected);
  });
});

describe('findKnownRole', () => {
  it('should return the role when the stored code is a known role', () => {
    expect(findKnownRole(Role.HR)).toBe(Role.HR);
  });

  it('should return undefined when the stored code is not a known role', () => {
    expect(findKnownRole('ADMIN')).toBeUndefined();
  });
});
