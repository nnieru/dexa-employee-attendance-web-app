import { HttpResponse, http } from 'msw';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listenForWindowFocus } from '@dexa/session';
import { mswServer } from '../../../test/msw-server.js';
import {
  accountCheckSucceeds,
  loginSucceeds,
  VALID_PASSWORD,
} from '../../../test/admin-app-harness.js';
import { answerEmployeeList, openEmployeeList } from '../../../test/employee-list-test-helpers.js';
import {
  buildEmployeeListItem,
  buildEmployeeListPage,
  employeeListSucceeds,
  photoThumbnailsSucceeds,
} from '../../../test/employee-list-fixtures.js';
import {
  ACTIVE_STATUS_ID,
  buildCreatedEmployee,
  CREATED_ACCOUNT_ID,
  employeeStatusesSucceed,
  POSITIONS_URL,
  positionsSucceed,
  PRODUCT_ANALYST_POSITION_ID,
  RETIRED_POSITION_ID,
} from '../../../test/create-employee-fixtures.js';
import {
  fillValidEmployeeForm,
  getAddEmployeeSubmitButton,
  openCreateEmployeeForm,
  recordCreateEmployeeRequests,
} from '../../../test/create-employee-test-helpers.js';

const FIRST_OPERATION_ID = '3f2b8c1e-5a4d-4e7b-9c2a-1d0e9f8a7b6c';
const SECOND_OPERATION_ID = '8d1e2f3a-4b5c-4d6e-8f70-a1b2c3d4e5f6';
const DUPLICATE_EMAIL_SERVER_MESSAGE = 'An account already uses this company email.';
const DUPLICATE_EMAIL_FIELD_MESSAGE = 'This company email is already in use.';
const PROVISIONING_INCOMPLETE_MESSAGE =
  'Employee creation did not finish. Retry with the same operation ID to finish it.';
const POSITIONS_FAILURE_MESSAGE = 'Positions could not be loaded.';

let stopListeningForWindowFocus: () => void = () => undefined;

beforeEach(() => {
  mswServer.use(
    loginSucceeds(),
    accountCheckSucceeds(),
    employeeListSucceeds(),
    photoThumbnailsSucceeds(),
    positionsSucceed(),
    employeeStatusesSucceed(),
  );
  stopListeningForWindowFocus = listenForWindowFocus();
});

afterEach(() => {
  stopListeningForWindowFocus();
  vi.restoreAllMocks();
});

/** Replaces crypto.randomUUID for the next calls, in order, so each form session gets a known operation ID. */
function mockOperationIds(...operationIds: Array<ReturnType<typeof crypto.randomUUID>>) {
  const randomUuid = vi.spyOn(crypto, 'randomUUID');
  for (const operationId of operationIds) randomUuid.mockReturnValueOnce(operationId);
  return randomUuid;
}

describe('HR create employee', () => {
  it('should send the entered values with a normalized email and a null phone when the phone is empty', async () => {
    mockOperationIds(FIRST_OPERATION_ID);
    const requests = recordCreateEmployeeRequests((request) =>
      HttpResponse.json(buildCreatedEmployee(request), { status: 201 }),
    );
    const { user } = await openCreateEmployeeForm();

    await fillValidEmployeeForm(user);
    await user.click(getAddEmployeeSubmitButton());

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toEqual({
      operationId: FIRST_OPERATION_ID,
      name: 'Sari Dewi',
      email: 'sari.dewi@dexa.test',
      positionId: PRODUCT_ANALYST_POSITION_ID,
      employeeStatusId: ACTIVE_STATUS_ID,
      phoneNumber: null,
      role: 'EMPLOYEE',
      initialPassword: VALID_PASSWORD,
    });
  });

  it('should return to the list with a success message and show the new employee when the save succeeds', async () => {
    mockOperationIds(FIRST_OPERATION_ID);
    let isEmployeeCreated = false;
    const listQueries = answerEmployeeList(() =>
      buildEmployeeListPage({
        items: isEmployeeCreated
          ? [
              buildEmployeeListItem({
                accountId: CREATED_ACCOUNT_ID,
                name: 'Sari Dewi',
                email: 'sari.dewi@dexa.test',
              }),
            ]
          : [],
        totalItems: isEmployeeCreated ? 1 : 0,
      }),
    );
    recordCreateEmployeeRequests((request) => {
      isEmployeeCreated = true;
      return HttpResponse.json(buildCreatedEmployee(request), { status: 201 });
    });
    const { user } = await openEmployeeList('/employees');
    const listRequestCountBeforeCreate = listQueries.length;
    await user.click(screen.getByRole('button', { name: 'Add employee' }));
    await screen.findByRole('heading', { level: 1, name: 'Add employee' });

    await fillValidEmployeeForm(user);
    await user.click(getAddEmployeeSubmitButton());

    expect(await screen.findByRole('heading', { level: 1, name: 'Employees' })).toBeInTheDocument();
    expect(await screen.findByText('Sari Dewi was added.')).toBeInTheDocument();
    expect(await screen.findByRole('row', { name: /Sari Dewi/ })).toBeInTheDocument();
    expect(listQueries.length).toBeGreaterThan(listRequestCountBeforeCreate);
  });

  it('should show the duplicate email message on the email field and keep the entered values when the server answers 409', async () => {
    mockOperationIds(FIRST_OPERATION_ID);
    recordCreateEmployeeRequests(() =>
      HttpResponse.json(
        { statusCode: 409, code: 'CONFLICT', message: DUPLICATE_EMAIL_SERVER_MESSAGE },
        { status: 409 },
      ),
    );
    const { user } = await openCreateEmployeeForm();

    await fillValidEmployeeForm(user);
    await user.click(getAddEmployeeSubmitButton());

    const emailField = screen.getByLabelText('Company email');
    expect(await screen.findByText(DUPLICATE_EMAIL_FIELD_MESSAGE)).toBeInTheDocument();
    expect(emailField).toHaveAttribute('aria-invalid', 'true');
    expect(emailField).toHaveAccessibleDescription(DUPLICATE_EMAIL_FIELD_MESSAGE);
    expect(screen.queryByText(DUPLICATE_EMAIL_SERVER_MESSAGE)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('  Sari Dewi  ');
  });

  it('should send no request and name each required field when the form is submitted empty', async () => {
    const requests = recordCreateEmployeeRequests(() => HttpResponse.json({}, { status: 201 }));
    const { user } = await openCreateEmployeeForm();

    await user.click(getAddEmployeeSubmitButton());

    expect(await screen.findByText('Enter the employee name.')).toBeInTheDocument();
    expect(screen.getByText('Select a position.')).toBeInTheDocument();
    expect(screen.getByText('Select an employment status.')).toBeInTheDocument();
    expect(screen.getByText('Password must be at least 8 characters.')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true');
    expect(requests).toEqual([]);
  });

  it('should send no request and show the failed rule when the password has no number and the phone is malformed', async () => {
    const requests = recordCreateEmployeeRequests(() => HttpResponse.json({}, { status: 201 }));
    const { user } = await openCreateEmployeeForm();

    await fillValidEmployeeForm(user);
    await user.clear(screen.getByLabelText('Initial password'));
    await user.type(screen.getByLabelText('Initial password'), 'letters-only');
    await user.type(screen.getByLabelText('Phone number'), 'not-a-phone');
    await user.click(getAddEmployeeSubmitButton());

    expect(await screen.findByText('Password must include a number.')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Use an optional leading + followed by 8 to 15 digits, or leave this empty.',
      ),
    ).toBeInTheDocument();
    expect(requests).toEqual([]);
  });

  it('should send the same operation ID on the retry after a failed save and show the server message', async () => {
    const randomUuid = mockOperationIds(FIRST_OPERATION_ID, SECOND_OPERATION_ID);
    const requests = recordCreateEmployeeRequests((request, attempt) =>
      attempt === 1
        ? HttpResponse.json(
            {
              statusCode: 503,
              code: 'EMPLOYEE_PROVISIONING_INCOMPLETE',
              message: PROVISIONING_INCOMPLETE_MESSAGE,
              details: { operationId: request.operationId, savedPhase: 'RESERVED' },
            },
            { status: 503 },
          )
        : HttpResponse.json(buildCreatedEmployee(request), { status: 201 }),
    );
    const { user } = await openCreateEmployeeForm();
    await fillValidEmployeeForm(user);

    await user.click(getAddEmployeeSubmitButton());
    expect(await screen.findByText(PROVISIONING_INCOMPLETE_MESSAGE)).toBeInTheDocument();
    await user.click(getAddEmployeeSubmitButton());

    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[0]?.operationId).toBe(FIRST_OPERATION_ID);
    expect(requests[1]).toEqual(requests[0]);
    expect(randomUuid).toHaveBeenCalledTimes(1);
  });

  it('should send a new operation ID when the HR user opens the form again after leaving it', async () => {
    mockOperationIds(FIRST_OPERATION_ID, SECOND_OPERATION_ID);
    const requests = recordCreateEmployeeRequests((request) =>
      HttpResponse.json(buildCreatedEmployee(request), { status: 201 }),
    );
    const { user } = await openCreateEmployeeForm();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await screen.findByRole('heading', { level: 1, name: 'Employees' });
    await user.click(screen.getByRole('button', { name: 'Add employee' }));
    await screen.findByRole('heading', { level: 1, name: 'Add employee' });

    await fillValidEmployeeForm(user);
    await user.click(getAddEmployeeSubmitButton());

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]?.operationId).toBe(SECOND_OPERATION_ID);
  });

  it('should send one request when the HR user clicks Add employee again while the save is pending', async () => {
    mockOperationIds(FIRST_OPERATION_ID);
    let releaseAnswer: () => void = () => undefined;
    const isAnswerReleased = new Promise<void>((resolve) => {
      releaseAnswer = resolve;
    });
    const requests = recordCreateEmployeeRequests(async (request) => {
      await isAnswerReleased;
      return HttpResponse.json(buildCreatedEmployee(request), { status: 201 });
    });
    const { user } = await openCreateEmployeeForm();
    await fillValidEmployeeForm(user);

    await user.click(getAddEmployeeSubmitButton());
    await waitFor(() => expect(getAddEmployeeSubmitButton()).toBeDisabled());
    await user.click(getAddEmployeeSubmitButton());
    releaseAnswer();

    await screen.findByRole('heading', { level: 1, name: 'Employees' });
    expect(requests).toHaveLength(1);
  });

  it('should offer only active options and retry the positions lookup after it fails', async () => {
    let isPositionsAvailable = false;
    mswServer.use(
      http.get(POSITIONS_URL, () =>
        isPositionsAvailable
          ? HttpResponse.json([
              {
                id: PRODUCT_ANALYST_POSITION_ID,
                code: 'ANALYST',
                name: 'Product Analyst',
                isActive: true,
              },
              { id: RETIRED_POSITION_ID, code: 'RETIRED', name: 'Retired Role', isActive: false },
            ])
          : HttpResponse.json(
              {
                statusCode: 500,
                code: 'INTERNAL_ERROR',
                message: 'Something went wrong. Try again.',
              },
              { status: 500 },
            ),
      ),
    );
    const { user } = await openCreateEmployeeForm();

    expect(await screen.findByText(POSITIONS_FAILURE_MESSAGE)).toBeInTheDocument();
    expect(screen.getByLabelText('Position')).toBeDisabled();

    isPositionsAvailable = true;
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    const positionSelect = await screen.findByLabelText('Position');
    await waitFor(() => expect(positionSelect).toBeEnabled());
    expect(
      within(positionSelect).getByRole('option', { name: 'Product Analyst' }),
    ).toBeInTheDocument();
    expect(
      within(positionSelect).queryByRole('option', { name: 'Retired Role' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(POSITIONS_FAILURE_MESSAGE)).not.toBeInTheDocument();

    const statusSelect = screen.getByLabelText('Employment status');
    expect(statusSelect).toBeEnabled();
    expect(within(statusSelect).getByRole('option', { name: 'Active' })).toBeInTheDocument();
    expect(
      within(statusSelect).queryByRole('option', { name: 'Inactive' }),
    ).not.toBeInTheDocument();
  });
});
