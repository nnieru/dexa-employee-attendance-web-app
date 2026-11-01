import type { CreateEmployeeRequest, MasterOption } from '@dexa/contracts';
import { HttpResponse, http } from 'msw';

export const CREATE_EMPLOYEE_URL = '/api/v1/employees';
export const POSITIONS_URL = '/api/v1/positions';
export const EMPLOYEE_STATUSES_URL = '/api/v1/employee-statuses';

// Fixed UUIDs (v4 shape) so every run is deterministic.
export const PRODUCT_ANALYST_POSITION_ID = '1d5f8c2b-4a6e-4b3c-8f7d-8e9a0b1c2d3e';
export const RETIRED_POSITION_ID = '6e9a2b1c-3d4f-4a5b-8c6d-7e8f9a0b1c2d';
export const ACTIVE_STATUS_ID = '0c4e7b1a-3f5d-4a2b-9e6c-7d8f9a0b1c2d';
export const INACTIVE_STATUS_ID = '2b8e0d5f-6c3a-4d1e-9f2b-3c4d5e6f7a8b';
export const CREATED_ACCOUNT_ID = '4a8c2e6f-1b3d-4e5f-8a7b-9c0d1e2f3a4b';

export const POSITION_OPTIONS: ReadonlyArray<MasterOption> = [
  { id: PRODUCT_ANALYST_POSITION_ID, code: 'ANALYST', name: 'Product Analyst', isActive: true },
  { id: RETIRED_POSITION_ID, code: 'RETIRED', name: 'Retired Role', isActive: false },
];

export const EMPLOYEE_STATUS_OPTIONS: ReadonlyArray<MasterOption> = [
  { id: ACTIVE_STATUS_ID, code: 'ACTIVE', name: 'Active', isActive: true },
  { id: INACTIVE_STATUS_ID, code: 'INACTIVE', name: 'Inactive', isActive: false },
];

export function positionsSucceed(options: ReadonlyArray<MasterOption> = POSITION_OPTIONS) {
  return http.get(POSITIONS_URL, () => HttpResponse.json([...options]));
}

export function employeeStatusesSucceed(
  options: ReadonlyArray<MasterOption> = EMPLOYEE_STATUS_OPTIONS,
) {
  return http.get(EMPLOYEE_STATUSES_URL, () => HttpResponse.json([...options]));
}

export function positionsFail() {
  return http.get(POSITIONS_URL, () =>
    HttpResponse.json(
      { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Something went wrong. Try again.' },
      { status: 500 },
    ),
  );
}

/** The saved employee as the server answers it. The name and email come from the request that was sent. */
export function buildCreatedEmployee(request: CreateEmployeeRequest) {
  const position = POSITION_OPTIONS.find((option) => option.id === request.positionId);
  const employeeStatus = EMPLOYEE_STATUS_OPTIONS.find(
    (option) => option.id === request.employeeStatusId,
  );
  return {
    accountId: CREATED_ACCOUNT_ID,
    name: request.name,
    email: request.email,
    role: request.role,
    position: {
      id: request.positionId,
      code: position?.code ?? 'UNKNOWN',
      name: position?.name ?? '',
    },
    employeeStatus: {
      id: request.employeeStatusId,
      code: employeeStatus?.code ?? 'UNKNOWN',
      name: employeeStatus?.name ?? '',
    },
    phoneNumber: request.phoneNumber,
    profileStatus: 'INCOMPLETE',
  };
}
