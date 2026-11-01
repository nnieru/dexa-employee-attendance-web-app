import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { createEmployeeRequestSchema, type CreateEmployeeRequest } from '@dexa/contracts';
import { mswServer } from './msw-server.js';
import { HR_ACCOUNT, VALID_PASSWORD, renderAdminApp, signInWith } from './admin-app-harness.js';
import {
  CREATE_EMPLOYEE_URL,
  PRODUCT_ANALYST_POSITION_ID,
  ACTIVE_STATUS_ID,
} from './create-employee-fixtures.js';

/**
 * Records the body of every create request, parsed with the contract. The answer comes from `respond`, which gets the
 * 1-based attempt number, so a test can fail the first attempt and succeed on the retry.
 */
export function recordCreateEmployeeRequests(
  respond: (request: CreateEmployeeRequest, attempt: number) => Response | Promise<Response>,
): Array<CreateEmployeeRequest> {
  const requests: Array<CreateEmployeeRequest> = [];
  mswServer.use(
    http.post(CREATE_EMPLOYEE_URL, async ({ request }) => {
      const body = createEmployeeRequestSchema.parse(await request.json());
      requests.push(body);
      return respond(body, requests.length);
    }),
  );
  return requests;
}

/** Signs in and opens `path`. The page heading is the first thing the form tests wait for. */
export async function openCreateEmployeeForm(path = '/employees/new') {
  const user = userEvent.setup();
  const router = await renderAdminApp(`/login?redirect=${encodeURIComponent(path)}`);
  await signInWith(user, HR_ACCOUNT.email);
  await screen.findByRole('heading', { level: 1, name: 'Add employee' });
  return { user, router };
}

/** Fills every required field with valid values. Phone is left empty, which the form sends as null. */
export async function fillValidEmployeeForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Name'), '  Sari Dewi  ');
  await user.type(screen.getByLabelText('Company email'), 'Sari.Dewi@Dexa.test');
  await user.selectOptions(screen.getByLabelText('Position'), PRODUCT_ANALYST_POSITION_ID);
  await user.selectOptions(screen.getByLabelText('Employment status'), ACTIVE_STATUS_ID);
  await user.type(screen.getByLabelText('Initial password'), VALID_PASSWORD);
}

export function getAddEmployeeSubmitButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Add employee' });
}
