import { ProfileStatus, Role } from '@dexa/contracts';
import type { EmployeeDetailRecord } from './employee-provisioning.repository.interface.js';
import { toEmployeeDetail } from './employee-detail.rules.js';

const RECORD: EmployeeDetailRecord = {
  accountId: '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13',
  name: 'Nadia Rahma',
  position: {
    id: '7a1d2e3f-4b5c-4d6e-8f70-1a2b3c4d5e6f',
    code: 'FULLSTACK_DEVELOPER',
    name: 'Fullstack Developer',
  },
  employeeStatus: { id: '0b6f7c0e-4f3a-4d55-9d1e-7a2b3c4d5e6f', code: 'ACTIVE', name: 'Active' },
  phoneNumber: '+6281234567890',
  profileStatus: ProfileStatus.COMPLETE,
};

describe('toEmployeeDetail', () => {
  it('should take the email and role from the Auth account and the rest from the profile', () => {
    const account = { id: RECORD.accountId, email: 'nadia.rahma@dexa.test', role: Role.HR };

    expect(toEmployeeDetail(RECORD, account)).toEqual({
      accountId: RECORD.accountId,
      name: 'Nadia Rahma',
      email: 'nadia.rahma@dexa.test',
      role: Role.HR,
      position: RECORD.position,
      employeeStatus: RECORD.employeeStatus,
      phoneNumber: '+6281234567890',
      profileStatus: ProfileStatus.COMPLETE,
    });
  });
});
