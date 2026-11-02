import { HttpResponse, http } from 'msw';
import { QueryClient } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listenForWindowFocus } from '@dexa/session';
import { mswServer } from '../../../test/msw-server.js';
import {
  accountCheckSucceeds,
  HR_ACCOUNT,
  loginSucceeds,
  VALID_PASSWORD,
} from '../../../test/admin-app-harness.js';
import { answerEmployeeList } from '../../../test/employee-list-test-helpers.js';
import {
  buildEmployeeListPage,
  DEWI,
  employeeListSucceeds,
  photoThumbnailsSucceeds,
} from '../../../test/employee-list-fixtures.js';
import {
  ACTIVE_STATUS_ID,
  employeeStatusesSucceed,
  INACTIVE_STATUS_ID,
  POSITION_OPTIONS,
  positionsSucceed,
  PRODUCT_ANALYST_POSITION_ID,
  RETIRED_POSITION_ID,
} from '../../../test/create-employee-fixtures.js';
import {
  buildEmployeeDetail,
  buildSavedEmployee,
  EMPLOYEE_DETAIL_URL,
  employeeDetailFails,
  employeeDetailSucceeds,
  TARGET_ACCOUNT_ID,
  UPDATE_STATUS_OPTIONS,
} from '../../../test/update-employee-fixtures.js';
import {
  getSaveButton,
  openEditEmployeePage,
  recordEmployeeUpdateRequests,
  signInToEditPage,
} from '../../../test/update-employee-test-helpers.js';

const DEWI_NAME = 'Dewi Lestari';
const RENAMED_NAME = 'Dewi Lestari Putri';
const NEW_PHONE_NUMBER = '+628222222222';
const DESIGNER_POSITION_ID = '9a1c3e5f-7b2d-4c6e-8f0a-1b3d5f7a9c2e';
const EMAIL_VALUE = 'dewi.lestari@dexa.test';
const PARTIAL_UPDATE_MESSAGE =
  'The employee update did not finish. Check the employee before saving the update again.';
const LOAD_FAILURE_MESSAGE = 'The employee could not be loaded. Try again.';
const NOT_FOUND_MESSAGE = 'This employee could not be found.';
const DEACTIVATE_TITLE = `Deactivate ${DEWI_NAME}?`;

let stopListeningForWindowFocus: () => void = () => undefined;

beforeEach(() => {
  mswServer.use(
    loginSucceeds(),
    accountCheckSucceeds(),
    employeeListSucceeds(),
    photoThumbnailsSucceeds(),
    positionsSucceed(),
    employeeStatusesSucceed(UPDATE_STATUS_OPTIONS),
    employeeDetailSucceeds(),
  );
  stopListeningForWindowFocus = listenForWindowFocus();
});

afterEach(() => {
  stopListeningForWindowFocus();
  vi.restoreAllMocks();
});

/** Counts the employee detail requests, so a test can see when the detail is loaded again. */
function countEmployeeDetailRequests(): () => number {
  let requestCount = 0;
  mswServer.use(
    http.get(EMPLOYEE_DETAIL_URL, () => {
      requestCount += 1;
      return HttpResponse.json(buildEmployeeDetail());
    }),
  );
  return () => requestCount;
}

/** Answers every update with the stored employee plus the requested changes. */
function acceptUpdates(stored = buildEmployeeDetail()) {
  return recordEmployeeUpdateRequests((request) =>
    HttpResponse.json(buildSavedEmployee(stored, request)),
  );
}

describe('HR update employee', () => {
  it('should send only the changed fields and return to the list with a success message when the save succeeds', async () => {
    const queryClient = new QueryClient();
    let isRenamed = false;
    const detailRequestCount = countEmployeeDetailRequests();
    const requests = recordEmployeeUpdateRequests((request) => {
      isRenamed = true;
      return HttpResponse.json(buildSavedEmployee(buildEmployeeDetail(), request));
    });
    const listQueries = answerEmployeeList(() =>
      buildEmployeeListPage({
        items: [isRenamed ? { ...DEWI, name: RENAMED_NAME } : DEWI],
        totalItems: 1,
      }),
    );
    const { user } = await openEditEmployeePage(undefined, queryClient);
    const detailRequestCountBeforeSave = detailRequestCount();

    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), RENAMED_NAME);
    await user.clear(screen.getByLabelText('Phone number'));
    await user.type(screen.getByLabelText('Phone number'), NEW_PHONE_NUMBER);
    await user.click(getSaveButton());

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toEqual({ name: RENAMED_NAME, phoneNumber: NEW_PHONE_NUMBER });
    expect(await screen.findByRole('heading', { level: 1, name: 'Employees' })).toBeInTheDocument();
    expect(await screen.findByText(`${RENAMED_NAME} was updated.`)).toBeInTheDocument();
    expect(await screen.findByRole('row', { name: new RegExp(RENAMED_NAME) })).toBeInTheDocument();
    expect(listQueries.length).toBeGreaterThan(0);
    expect(detailRequestCount()).toBe(detailRequestCountBeforeSave + 1);
  });

  it('should send nothing and keep the status when the HR user cancels the deactivation', async () => {
    const requests = acceptUpdates();
    const { user } = await openEditEmployeePage();

    await user.selectOptions(screen.getByLabelText('Employment status'), INACTIVE_STATUS_ID);
    await user.click(getSaveButton());
    const dialog = await screen.findByRole('dialog', { name: DEACTIVATE_TITLE });
    expect(within(dialog).getByText(/logged out immediately/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(requests).toEqual([]);
    expect(screen.getByLabelText('Employment status')).toHaveValue(INACTIVE_STATUS_ID);
  });

  it('should send only the INACTIVE status when the HR user confirms the deactivation', async () => {
    const requests = acceptUpdates();
    const { user } = await openEditEmployeePage();

    await user.selectOptions(screen.getByLabelText('Employment status'), INACTIVE_STATUS_ID);
    await user.click(getSaveButton());
    const dialog = await screen.findByRole('dialog', { name: DEACTIVATE_TITLE });
    await user.click(within(dialog).getByRole('button', { name: 'Deactivate employee' }));

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toEqual({ employeeStatusId: INACTIVE_STATUS_ID });
  });

  it('should disable the status control and say why when the HR user edits their own account', async () => {
    mswServer.use(employeeDetailSucceeds(buildEmployeeDetail({ accountId: HR_ACCOUNT.id })));
    await openEditEmployeePage(`/employees/${HR_ACCOUNT.id}/edit`);

    const statusSelect = screen.getByLabelText('Employment status');
    await waitFor(() => expect(statusSelect).toBeDisabled());
    expect(statusSelect).toHaveAccessibleDescription(
      'You cannot change the employment status of your own account.',
    );
    expect(screen.getByLabelText('Name')).toBeEnabled();
  });

  it('should save a name change on the own account without naming the disabled status', async () => {
    mswServer.use(employeeDetailSucceeds(buildEmployeeDetail({ accountId: HR_ACCOUNT.id })));
    const requests = acceptUpdates(buildEmployeeDetail({ accountId: HR_ACCOUNT.id }));
    const { user } = await openEditEmployeePage(`/employees/${HR_ACCOUNT.id}/edit`);
    await waitFor(() => expect(screen.getByLabelText('Employment status')).toBeDisabled());

    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), RENAMED_NAME);
    await user.click(getSaveButton());

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toEqual({ name: RENAMED_NAME });
  });

  it('should send no request and name the rule when the name is cleared', async () => {
    const requests = acceptUpdates();
    const { user } = await openEditEmployeePage();

    await user.clear(screen.getByLabelText('Name'));
    await user.click(getSaveButton());

    expect(await screen.findByText('Enter the employee name.')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true');
    expect(requests).toEqual([]);
  });

  it('should send no request and name the rule when the new password has no number', async () => {
    const requests = acceptUpdates();
    const { user } = await openEditEmployeePage();

    await user.type(screen.getByLabelText('New password'), 'letters-only');
    await user.click(getSaveButton());

    expect(await screen.findByText('Password must include a number.')).toBeInTheDocument();
    expect(requests).toEqual([]);
  });

  it('should send no request and name the format when the phone number is malformed', async () => {
    const requests = acceptUpdates();
    const { user } = await openEditEmployeePage();

    await user.clear(screen.getByLabelText('Phone number'));
    await user.type(screen.getByLabelText('Phone number'), 'not-a-phone');
    await user.click(getSaveButton());

    expect(
      await screen.findByText(
        'Use an optional leading + followed by 8 to 15 digits, or leave this empty.',
      ),
    ).toBeInTheDocument();
    expect(requests).toEqual([]);
  });

  it('should send only the new password when the HR user enters one and changes nothing else', async () => {
    const requests = acceptUpdates();
    const { user } = await openEditEmployeePage();

    await user.type(screen.getByLabelText('New password'), VALID_PASSWORD);
    await user.click(getSaveButton());

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toEqual({ newPassword: VALID_PASSWORD });
  });

  it('should keep the company email read-only and send no email when the HR user saves', async () => {
    const requests = acceptUpdates();
    const { user } = await openEditEmployeePage();
    const emailField = screen.getByLabelText('Company email');

    expect(emailField).toHaveAttribute('readonly');
    expect(emailField).toHaveValue(EMAIL_VALUE);
    await user.type(emailField, 'changed@dexa.test');
    expect(emailField).toHaveValue(EMAIL_VALUE);
    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), RENAMED_NAME);
    await user.click(getSaveButton());

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toEqual({ name: RENAMED_NAME });
    expect(requests[0]).not.toHaveProperty('email');
  });

  it('should keep Save disabled when nothing has changed', async () => {
    const requests = acceptUpdates();
    await openEditEmployeePage();

    expect(getSaveButton()).toBeDisabled();
    expect(requests).toEqual([]);
  });

  it('should show the field message from the server next to the position and keep the values', async () => {
    mswServer.use(
      positionsSucceed([
        ...POSITION_OPTIONS,
        { id: DESIGNER_POSITION_ID, code: 'DESIGNER', name: 'Designer', isActive: true },
      ]),
    );
    const requests = recordEmployeeUpdateRequests(() =>
      HttpResponse.json(
        {
          statusCode: 400,
          code: 'VALIDATION_FAILED',
          message: 'positionId: must reference an existing active position.',
        },
        { status: 400 },
      ),
    );
    const { user } = await openEditEmployeePage();

    await user.selectOptions(screen.getByLabelText('Position'), DESIGNER_POSITION_ID);
    await user.click(getSaveButton());

    await waitFor(() => expect(requests).toHaveLength(1));
    const positionField = screen.getByLabelText('Position');
    expect(
      await screen.findByText('must reference an existing active position.'),
    ).toBeInTheDocument();
    expect(positionField).toHaveAttribute('aria-invalid', 'true');
    expect(positionField).toHaveValue(DESIGNER_POSITION_ID);
  });

  it('should show the server message in an alert and keep the entered values when the save fails', async () => {
    recordEmployeeUpdateRequests(() =>
      HttpResponse.json(
        {
          statusCode: 503,
          code: 'DEPENDENCY_UNAVAILABLE',
          message: 'The account service is unavailable. Try again.',
        },
        { status: 503 },
      ),
    );
    const { user } = await openEditEmployeePage();

    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), RENAMED_NAME);
    await user.click(getSaveButton());

    expect(await screen.findByRole('alert', {})).toHaveTextContent(
      'The account service is unavailable. Try again.',
    );
    expect(screen.getByLabelText('Name')).toHaveValue(RENAMED_NAME);
  });

  it('should repeat the status on the next save when an earlier save did not finish', async () => {
    const requests = recordEmployeeUpdateRequests((request, attempt) =>
      attempt === 1
        ? HttpResponse.json(
            {
              statusCode: 503,
              code: 'EMPLOYEE_UPDATE_INCOMPLETE',
              message: PARTIAL_UPDATE_MESSAGE,
              details: { accountId: TARGET_ACCOUNT_ID },
            },
            { status: 503 },
          )
        : HttpResponse.json(buildSavedEmployee(buildEmployeeDetail(), request)),
    );
    const { user } = await openEditEmployeePage();

    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), RENAMED_NAME);
    await user.click(getSaveButton());
    expect(await screen.findByText(PARTIAL_UPDATE_MESSAGE)).toBeInTheDocument();
    await user.click(getSaveButton());

    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1]).toEqual({
      name: RENAMED_NAME,
      employeeStatusId: ACTIVE_STATUS_ID,
    });
  });

  it('should show the stored position even when it is inactive and offer only active options', async () => {
    mswServer.use(
      employeeDetailSucceeds(
        buildEmployeeDetail({
          position: { id: RETIRED_POSITION_ID, code: 'RETIRED', name: 'Retired Role' },
        }),
      ),
    );
    await openEditEmployeePage();

    const positionSelect = screen.getByLabelText('Position');
    expect(positionSelect).toHaveValue(RETIRED_POSITION_ID);
    expect(
      within(positionSelect).getByRole('option', { name: 'Retired Role' }),
    ).toBeInTheDocument();
    expect(
      within(positionSelect).getByRole('option', { name: 'Product Analyst' }),
    ).toBeInTheDocument();
    expect(
      within(positionSelect).queryByRole('option', { name: 'Inactive' }),
    ).not.toBeInTheDocument();
    expect(positionSelect).not.toHaveValue(PRODUCT_ANALYST_POSITION_ID);
  });

  it('should show a not-found message and no form when the employee does not exist', async () => {
    mswServer.use(employeeDetailFails(404, 'NOT_FOUND', 'Employee profile not found.'));
    await signInToEditPage();

    expect(await screen.findByText(NOT_FOUND_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('should load the employee again when the HR user retries after a load failure', async () => {
    let isAvailable = false;
    mswServer.use(
      http.get(EMPLOYEE_DETAIL_URL, () =>
        isAvailable
          ? HttpResponse.json(buildEmployeeDetail())
          : HttpResponse.json(
              { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Something went wrong.' },
              { status: 500 },
            ),
      ),
    );
    const { user } = await signInToEditPage();

    expect(await screen.findByText(LOAD_FAILURE_MESSAGE)).toBeInTheDocument();
    isAvailable = true;
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByLabelText('Name')).toHaveValue(DEWI_NAME);
  });
});
