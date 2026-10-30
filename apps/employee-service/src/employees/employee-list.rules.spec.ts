import { ProfileStatus, Role, type AccountLookupItem } from '@dexa/contracts';
import type { EmployeeListRecord } from './employee-list-reader.interface.js';
import { toEmployeeListItem, toEmployeeListPage } from './employee-list.rules.js';

const ACCOUNT_ID = '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13';
const PHOTO_KEY = '3f1b2c4d-0a9e-4b8f-8c7d-6e5f4a3b2c1d.jpg';
const POSITION = { id: ACCOUNT_ID, code: 'FULLSTACK_DEVELOPER', name: 'Fullstack Developer' };
const EMPLOYEE_STATUS = { id: ACCOUNT_ID, code: 'ACTIVE', name: 'Active' };

function recordWith(overrides: Partial<EmployeeListRecord> = {}): EmployeeListRecord {
  return {
    accountId: ACCOUNT_ID,
    name: 'Nadia Rahma',
    position: POSITION,
    employeeStatus: EMPLOYEE_STATUS,
    phoneNumber: '+6281234567890',
    photoKey: PHOTO_KEY,
    profileStatus: ProfileStatus.COMPLETE,
    ...overrides,
  };
}

const ACCOUNT: AccountLookupItem = {
  id: ACCOUNT_ID,
  email: 'nadia.rahma@dexa.test',
  role: Role.EMPLOYEE,
};

describe('toEmployeeListItem', () => {
  it('should take the email and role from the account Auth answered with', () => {
    expect(toEmployeeListItem(recordWith(), ACCOUNT)).toMatchObject({
      email: 'nadia.rahma@dexa.test',
      role: Role.EMPLOYEE,
    });
  });

  it('should leave the email and role null when Auth did not answer for the account', () => {
    expect(toEmployeeListItem(recordWith(), undefined)).toMatchObject({
      email: null,
      role: null,
    });
  });

  it('should point the photo URL at the HR photo route when the employee has a photo', () => {
    expect(toEmployeeListItem(recordWith(), ACCOUNT).photoUrl).toBe(
      `/api/v1/employees/${ACCOUNT_ID}/photo`,
    );
  });

  it('should leave the photo URL null when the employee has no photo', () => {
    expect(toEmployeeListItem(recordWith({ photoKey: null }), ACCOUNT).photoUrl).toBeNull();
  });

  it('should return exactly the list fields and never the photo key', () => {
    const item = toEmployeeListItem(recordWith(), ACCOUNT);

    expect(Object.keys(item).sort()).toEqual(
      [
        'accountId',
        'email',
        'employeeStatus',
        'name',
        'phoneNumber',
        'photoUrl',
        'position',
        'profileStatus',
        'role',
      ].sort(),
    );
  });
});

describe('toEmployeeListPage', () => {
  it.each([
    { totalItems: 0, totalPages: 0 },
    { totalItems: 1, totalPages: 1 },
    { totalItems: 20, totalPages: 1 },
    { totalItems: 21, totalPages: 2 },
  ])(
    'should count $totalPages pages for $totalItems items at 20 per page',
    ({ totalItems, totalPages }) => {
      expect(toEmployeeListPage([], { page: 1, pageSize: 20 }, totalItems)).toEqual({
        items: [],
        page: 1,
        pageSize: 20,
        totalItems,
        totalPages,
      });
    },
  );
});
