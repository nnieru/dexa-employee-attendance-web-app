import type { EmployeeDetail, MasterOption, UpdateEmployeeRequest } from '@dexa/contracts';
import { HttpResponse, http } from 'msw';
import {
  ACTIVE_STATUS_ID,
  INACTIVE_STATUS_ID,
  PRODUCT_ANALYST_POSITION_ID,
} from './create-employee-fixtures.js';

// The employee detail and the update share one path (ADM-2). The account ID is the path parameter.
export const EMPLOYEE_DETAIL_URL = '/api/v1/employees/:accountId';
export const UPDATE_EMPLOYEE_URL = '/api/v1/employees/:accountId';

// The same ID as the employee list fixture's DEWI row, so both screens describe one employee.
export const TARGET_ACCOUNT_ID = '7c2e5f8a-9d1b-4e6c-a3f4-0b5c6d7e8f9a';

// Deactivation needs the INACTIVE option to be assignable, so the update tests offer it as an active option.
export const UPDATE_STATUS_OPTIONS: ReadonlyArray<MasterOption> = [
  { id: ACTIVE_STATUS_ID, code: 'ACTIVE', name: 'Active', isActive: true },
  { id: INACTIVE_STATUS_ID, code: 'INACTIVE', name: 'Inactive', isActive: true },
];

/** The stored employee as the server answers HR. Fields can be overridden per test. */
export function buildEmployeeDetail(overrides: Partial<EmployeeDetail> = {}): EmployeeDetail {
  return {
    accountId: TARGET_ACCOUNT_ID,
    name: 'Dewi Lestari',
    email: 'dewi.lestari@dexa.test',
    role: 'EMPLOYEE',
    position: { id: PRODUCT_ANALYST_POSITION_ID, code: 'ANALYST', name: 'Product Analyst' },
    employeeStatus: { id: ACTIVE_STATUS_ID, code: 'ACTIVE', name: 'Active' },
    phoneNumber: '+628111111111',
    profileStatus: 'COMPLETE',
    ...overrides,
  };
}

export function employeeDetailSucceeds(detail: EmployeeDetail = buildEmployeeDetail()) {
  return http.get(EMPLOYEE_DETAIL_URL, () => HttpResponse.json(detail));
}

export function employeeDetailFails(status: number, code: string, message: string) {
  return http.get(EMPLOYEE_DETAIL_URL, () =>
    HttpResponse.json({ statusCode: status, code, message }, { status }),
  );
}

/** The saved employee after an update: the stored one with the changed fields applied. */
export function buildSavedEmployee(
  stored: EmployeeDetail,
  request: UpdateEmployeeRequest,
): EmployeeDetail {
  return {
    ...stored,
    name: request.name ?? stored.name,
    phoneNumber: request.phoneNumber === undefined ? stored.phoneNumber : request.phoneNumber,
    position:
      request.positionId === undefined
        ? stored.position
        : { ...stored.position, id: request.positionId },
    employeeStatus:
      request.employeeStatusId === undefined
        ? stored.employeeStatus
        : { ...stored.employeeStatus, id: request.employeeStatusId },
  };
}
