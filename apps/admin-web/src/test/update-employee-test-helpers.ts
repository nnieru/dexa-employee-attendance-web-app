import type { QueryClient } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { updateEmployeeRequestSchema, type UpdateEmployeeRequest } from '@dexa/contracts';
import { mswServer } from './msw-server.js';
import { HR_ACCOUNT, renderAdminApp, signInWith } from './admin-app-harness.js';
import { UPDATE_EMPLOYEE_URL, TARGET_ACCOUNT_ID } from './update-employee-fixtures.js';

/**
 * Records the body of every update request, parsed with the contract. The answer comes from `respond`, which gets the
 * 1-based attempt number, so a test can fail one attempt and succeed on the retry.
 */
export function recordEmployeeUpdateRequests(
  respond: (request: UpdateEmployeeRequest, attempt: number) => Response | Promise<Response>,
): Array<UpdateEmployeeRequest> {
  const requests: Array<UpdateEmployeeRequest> = [];
  mswServer.use(
    http.patch(UPDATE_EMPLOYEE_URL, async ({ request }) => {
      const body = updateEmployeeRequestSchema.parse(await request.json());
      requests.push(body);
      return respond(body, requests.length);
    }),
  );
  return requests;
}

/** Signs in and opens `path` without waiting for the employee to load, so load-failure tests can drive the states. */
export async function signInToEditPage(
  path = `/employees/${TARGET_ACCOUNT_ID}/edit`,
  queryClient?: QueryClient,
) {
  const user = userEvent.setup();
  const router = await renderAdminApp(`/login?redirect=${encodeURIComponent(path)}`, queryClient);
  await signInWith(user, HR_ACCOUNT.email);
  await screen.findByRole('heading', { level: 1, name: 'Edit employee' });
  return { user, router };
}

/** Signs in and opens the edit page once the employee and both pickers are loaded, so the form fields exist. */
export async function openEditEmployeePage(
  path = `/employees/${TARGET_ACCOUNT_ID}/edit`,
  queryClient?: QueryClient,
) {
  const opened = await signInToEditPage(path, queryClient);
  await screen.findByLabelText('Name');
  return opened;
}

export function getSaveButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Save changes' });
}
