import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCode, type OvertimeRequest } from '@dexa/contracts';
import { mswServer } from '../../../test/msw-server.js';
import {
  EMPLOYEE_ACCOUNT,
  accountCheckSucceeds,
  loginSucceeds,
  renderEmployeeApp,
  signInWith,
} from '../../../test/employee-app-harness.js';
import {
  OVERTIME_END_TIME_HELP_TEXT,
  OVERTIME_IDEMPOTENCY_CONFLICT_MESSAGE,
  OVERTIME_REQUEST_SUBMITTED_MESSAGE,
  OVERTIME_SCHEDULE_NOT_CONFIGURED_MESSAGE,
} from '../utils/requests-messages.js';
import { OVERTIME_FORM_MESSAGES } from '../utils/overtime-request-form.schema.js';

const OVERTIME_SUBMIT_URL = '/api/v1/overtime-requests';
const OVERTIME_LIST_URL = '/api/v1/overtime-requests/me';
const FIRST_KEY = '3c1f7e2a-9d4b-4a6e-8f0c-5b2d1e9a7c01';
const SECOND_KEY = '3c1f7e2a-9d4b-4a6e-8f0c-5b2d1e9a7c02';

// Today in WIB is 2026-11-02, while the UTC date is still 2026-11-01 (WIB is UTC+7).
const NOW_IN_WIB_2_NOVEMBER = new Date('2026-11-01T18:00:00.000Z');
const TODAY = '2026-11-02';
const DEFAULT_REASON = 'Month-end reporting deadline';

const CREATED_REQUEST: OvertimeRequest = {
  id: '3c1f7e2a-9d4b-4a6e-8f0c-5b2d1e9a7c10',
  businessDate: TODAY,
  // 18:30–21:00 WIB
  startAt: '2026-11-02T11:30:00.000Z',
  endAt: '2026-11-02T14:00:00.000Z',
  reason: DEFAULT_REASON,
  status: 'PENDING',
  reviewReason: null,
  reviewedAt: null,
  createdAt: '2026-11-01T18:00:00.000Z',
};

type SubmitBody = Record<string, unknown>;

function overtimePage(items: ReadonlyArray<OvertimeRequest>) {
  return { items, page: 1, pageSize: 20, totalItems: items.length, totalPages: 1 };
}

function errorResponse(status: number, code: string, message: string) {
  return HttpResponse.json({ statusCode: status, code, message }, { status });
}

/** Answers each submission in turn and keeps the bodies, so a test can read what was sent. */
function submitEndpoint(
  respond: (body: SubmitBody, attemptIndex: number) => Response | Promise<Response>,
) {
  const submittedBodies: SubmitBody[] = [];
  return {
    submittedBodies,
    handler: http.post(OVERTIME_SUBMIT_URL, async ({ request }) => {
      const body = (await request.json()) as SubmitBody;
      submittedBodies.push(body);
      return respond(body, submittedBodies.length - 1);
    }),
  };
}

function listEndpoint(items: () => ReadonlyArray<OvertimeRequest>) {
  return http.get(OVERTIME_LIST_URL, () => HttpResponse.json(overtimePage(items())));
}

/** Signs in, opens Requests, and follows its Request overtime link, as an employee would. */
async function openRequestsThenOvertimeForm() {
  const user = userEvent.setup();
  const router = await renderEmployeeApp('/login?redirect=%2Frequests');
  await signInWith(user, EMPLOYEE_ACCOUNT.email);
  await screen.findByRole('heading', { level: 1, name: 'Requests' });
  await user.click(screen.getByRole('link', { name: 'Request overtime' }));
  await screen.findByRole('heading', { level: 1, name: 'Request overtime' });
  return { user, router };
}

/** Signs in and opens the overtime request form through the login redirect the app uses for protected pages. */
async function openOvertimeForm() {
  const user = userEvent.setup();
  const router = await renderEmployeeApp('/login?redirect=%2Frequests%2Fovertime%2Fnew');
  await signInWith(user, EMPLOYEE_ACCOUNT.email);
  await screen.findByRole('heading', { level: 1, name: 'Request overtime' });
  return { user, router };
}

function field(label: string): HTMLElement {
  return screen.getByLabelText(label);
}

function setField(label: string, value: string) {
  fireEvent.change(field(label), { target: { value } });
}

/** Fills every entry with a valid evening interval and the default reason, unless a test overrides one. */
function fillForm(
  overrides: Partial<Record<'startTime' | 'endTime' | 'reason' | 'businessDate', string>> = {},
) {
  setField('Business date', overrides.businessDate ?? TODAY);
  setField('Start time (WIB)', overrides.startTime ?? '18:30');
  setField('End time (WIB)', overrides.endTime ?? '21:00');
  setField('Reason', overrides.reason ?? DEFAULT_REASON);
}

async function pressSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Submit request' }));
}

let randomUuidSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW_IN_WIB_2_NOVEMBER);
  randomUuidSpy = vi
    .spyOn(crypto, 'randomUUID')
    .mockReturnValueOnce(FIRST_KEY)
    .mockReturnValueOnce(SECOND_KEY);
  mswServer.use(loginSucceeds(), accountCheckSucceeds());
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('overtime request submission', () => {
  it('should send the WIB instants, the trimmed reason and one idempotency key when the form is valid', async () => {
    const submit = submitEndpoint(() => HttpResponse.json(CREATED_REQUEST, { status: 201 }));
    mswServer.use(
      submit.handler,
      listEndpoint(() => []),
    );
    const { user } = await openOvertimeForm();

    fillForm({ reason: '  Month-end reporting deadline  ' });
    await pressSubmit(user);

    await screen.findByRole('heading', { level: 1, name: 'Requests' });
    expect(submit.submittedBodies).toEqual([
      {
        businessDate: TODAY,
        startAt: '2026-11-02T11:30:00.000Z',
        endAt: '2026-11-02T14:00:00.000Z',
        reason: DEFAULT_REASON,
        idempotencyKey: FIRST_KEY,
      },
    ]);
  });

  it('should return to the overtime list with the success message and the new request when the server accepts it', async () => {
    const submit = submitEndpoint(() => HttpResponse.json(CREATED_REQUEST, { status: 201 }));
    // The list answers with the request only after it was submitted, as the server would.
    let createdRequests: ReadonlyArray<OvertimeRequest> = [];
    mswServer.use(
      submit.handler,
      listEndpoint(() => createdRequests),
    );
    const { user, router } = await openRequestsThenOvertimeForm();
    createdRequests = [CREATED_REQUEST];

    fillForm();
    await pressSubmit(user);

    expect(await screen.findByText(OVERTIME_REQUEST_SUBMITTED_MESSAGE)).toBeInTheDocument();
    expect(await screen.findByRole('cell', { name: TODAY })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/requests');
    expect(router.state.location.search).toEqual({ tab: 'overtime' });
  });

  it.each([[200], [201]])('should treat a %s answer as success', async (status) => {
    const submit = submitEndpoint(() => HttpResponse.json(CREATED_REQUEST, { status }));
    mswServer.use(
      submit.handler,
      listEndpoint(() => []),
    );
    const { user } = await openOvertimeForm();

    fillForm();
    await pressSubmit(user);

    expect(await screen.findByRole('heading', { level: 1, name: 'Requests' })).toBeInTheDocument();
    expect(submit.submittedBodies).toHaveLength(1);
  });

  it('should leave the form without sending when Cancel is pressed', async () => {
    const submit = submitEndpoint(() => HttpResponse.json(CREATED_REQUEST, { status: 201 }));
    mswServer.use(
      submit.handler,
      listEndpoint(() => []),
    );
    const { user, router } = await openOvertimeForm();

    fillForm();
    await user.click(screen.getByRole('link', { name: 'Cancel' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Requests' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/requests');
    expect(submit.submittedBodies).toHaveLength(0);
  });
});

describe('overtime request client validation', () => {
  it.each([
    ['an empty reason', { reason: '' }, 'Reason', OVERTIME_FORM_MESSAGES.reasonRequired],
    ['a blank reason', { reason: '   ' }, 'Reason', OVERTIME_FORM_MESSAGES.reasonRequired],
    [
      'a reason of 501 characters',
      { reason: 'x'.repeat(501) },
      'Reason',
      OVERTIME_FORM_MESSAGES.reasonTooLong,
    ],
    [
      'an end time equal to the start time',
      { endTime: '18:30' },
      'End time (WIB)',
      OVERTIME_FORM_MESSAGES.endNotAfterStart,
    ],
    [
      'a business date eight days back',
      { businessDate: '2026-10-25' },
      'Business date',
      OVERTIME_FORM_MESSAGES.businessDateOutsideWindow,
    ],
  ])(
    'should show the field message and send nothing for %s',
    async (_description, overrides, label, message) => {
      const submit = submitEndpoint(() => HttpResponse.json(CREATED_REQUEST, { status: 201 }));
      mswServer.use(submit.handler);
      const { user } = await openOvertimeForm();

      fillForm(overrides);
      await pressSubmit(user);

      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(field(label)).toHaveAttribute('aria-invalid', 'true');
      expect(field(label)).toHaveAccessibleDescription(expect.stringContaining(message));
      expect(submit.submittedBodies).toHaveLength(0);
      expect(randomUuidSpy).not.toHaveBeenCalled();
    },
  );
});

describe('overtime request end time', () => {
  it('should show the next-day line and send an end on the next WIB date when the end is earlier than the start', async () => {
    const submit = submitEndpoint(() => HttpResponse.json(CREATED_REQUEST, { status: 201 }));
    mswServer.use(
      submit.handler,
      listEndpoint(() => []),
    );
    const { user } = await openOvertimeForm();

    fillForm({ startTime: '22:00', endTime: '01:00' });

    expect(field('End time (WIB)')).toHaveAccessibleDescription('Ends the next day (+1 day).');
    await pressSubmit(user);

    await screen.findByRole('heading', { level: 1, name: 'Requests' });
    expect(submit.submittedBodies[0]).toMatchObject({
      businessDate: TODAY,
      startAt: '2026-11-02T15:00:00.000Z',
      endAt: '2026-11-02T18:00:00.000Z',
    });
  });

  it('should show the help text under the end time when the end is later than the start', async () => {
    mswServer.use(listEndpoint(() => []));
    await openOvertimeForm();

    fillForm({ startTime: '18:30', endTime: '21:00' });

    expect(field('End time (WIB)')).toHaveAccessibleDescription(OVERTIME_END_TIME_HELP_TEXT);
  });
});

describe('overtime request server refusals', () => {
  it('should show an overlap on the start time and keep every entered value', async () => {
    const submit = submitEndpoint(() =>
      errorResponse(
        409,
        ErrorCode.OVERTIME_OVERLAP,
        'This overtime overlaps a pending or approved overtime request.',
      ),
    );
    mswServer.use(submit.handler);
    const { user } = await openOvertimeForm();

    fillForm();
    await pressSubmit(user);

    const message = 'This overtime overlaps a pending or approved overtime request.';
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(field('Start time (WIB)')).toHaveAccessibleDescription(expect.stringContaining(message));
    expect(field('Start time (WIB)')).toHaveValue('18:30');
    expect(field('End time (WIB)')).toHaveValue('21:00');
    expect(field('Reason')).toHaveValue(DEFAULT_REASON);
    expect(field('Business date')).toHaveValue(TODAY);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('should show the daily cap on the end time', async () => {
    const message = 'Pending and approved overtime for this date can total at most 4 hours.';
    mswServer.use(
      submitEndpoint(() => errorResponse(400, ErrorCode.OVERTIME_DAILY_CAP_EXCEEDED, message))
        .handler,
    );
    const { user } = await openOvertimeForm();

    fillForm();
    await pressSubmit(user);

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(field('End time (WIB)')).toHaveAccessibleDescription(expect.stringContaining(message));
    expect(field('End time (WIB)')).toHaveValue('21:00');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('should show the business date window on the business date field', async () => {
    const message = 'Overtime can be requested for today or up to 7 days back.';
    mswServer.use(
      submitEndpoint(() =>
        errorResponse(400, ErrorCode.OVERTIME_BUSINESS_DATE_OUTSIDE_WINDOW, message),
      ).handler,
    );
    const { user } = await openOvertimeForm();

    fillForm();
    await pressSubmit(user);

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(field('Business date')).toHaveAccessibleDescription(expect.stringContaining(message));
    expect(field('Business date')).toHaveValue(TODAY);
  });

  it('should show the key conflict message in the general alert and keep the values', async () => {
    mswServer.use(
      submitEndpoint(() =>
        errorResponse(
          409,
          ErrorCode.IDEMPOTENCY_KEY_CONFLICT,
          'This request key was already used.',
        ),
      ).handler,
    );
    const { user } = await openOvertimeForm();

    fillForm();
    await pressSubmit(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      OVERTIME_IDEMPOTENCY_CONFLICT_MESSAGE,
    );
    expect(field('Reason')).toHaveValue(DEFAULT_REASON);
  });

  it('should tell the employee to contact HR in the general alert when the schedule is not configured', async () => {
    mswServer.use(
      submitEndpoint(() =>
        errorResponse(409, ErrorCode.SCHEDULE_NOT_CONFIGURED, 'No work schedule covers this date.'),
      ).handler,
    );
    const { user } = await openOvertimeForm();

    fillForm();
    await pressSubmit(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      OVERTIME_SCHEDULE_NOT_CONFIGURED_MESSAGE,
    );
    expect(field('Start time (WIB)')).toHaveValue('18:30');
  });

  it('should show the network or server message in the general alert and keep the values', async () => {
    mswServer.use(
      submitEndpoint(() =>
        errorResponse(500, ErrorCode.INTERNAL_ERROR, 'Something went wrong. Try again.'),
      ).handler,
    );
    const { user } = await openOvertimeForm();

    fillForm();
    await pressSubmit(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Try again.');
    expect(field('Reason')).toHaveValue(DEFAULT_REASON);
    expect(field('Start time (WIB)')).toHaveValue('18:30');
  });
});

describe('overtime request idempotency key', () => {
  it('should send the same key on a retry with identical values after a server failure', async () => {
    const submit = submitEndpoint((_body, attemptIndex) =>
      attemptIndex === 0
        ? errorResponse(500, ErrorCode.INTERNAL_ERROR, 'Something went wrong. Try again.')
        : HttpResponse.json(CREATED_REQUEST, { status: 201 }),
    );
    mswServer.use(
      submit.handler,
      listEndpoint(() => []),
    );
    const { user } = await openOvertimeForm();

    fillForm();
    await pressSubmit(user);
    await screen.findByRole('alert');
    await pressSubmit(user);

    await screen.findByRole('heading', { level: 1, name: 'Requests' });
    expect(submit.submittedBodies).toHaveLength(2);
    expect(submit.submittedBodies[0]?.idempotencyKey).toBe(FIRST_KEY);
    expect(submit.submittedBodies[1]?.idempotencyKey).toBe(FIRST_KEY);
    expect(randomUuidSpy).toHaveBeenCalledTimes(1);
  });

  it('should send a new key on a retry after a value changed', async () => {
    const submit = submitEndpoint((_body, attemptIndex) =>
      attemptIndex === 0
        ? errorResponse(500, ErrorCode.INTERNAL_ERROR, 'Something went wrong. Try again.')
        : HttpResponse.json(CREATED_REQUEST, { status: 201 }),
    );
    mswServer.use(
      submit.handler,
      listEndpoint(() => []),
    );
    const { user } = await openOvertimeForm();

    fillForm();
    await pressSubmit(user);
    await screen.findByRole('alert');
    setField('Reason', 'Changed reason after the failure');
    await pressSubmit(user);

    await screen.findByRole('heading', { level: 1, name: 'Requests' });
    expect(submit.submittedBodies[0]?.idempotencyKey).toBe(FIRST_KEY);
    expect(submit.submittedBodies[1]).toMatchObject({
      reason: 'Changed reason after the failure',
      idempotencyKey: SECOND_KEY,
    });
    expect(randomUuidSpy).toHaveBeenCalledTimes(2);
  });

  it('should send a new key from a form that was opened again after a successful submission', async () => {
    const submit = submitEndpoint(() => HttpResponse.json(CREATED_REQUEST, { status: 201 }));
    mswServer.use(
      submit.handler,
      listEndpoint(() => []),
    );
    const { user } = await openOvertimeForm();

    fillForm();
    await pressSubmit(user);
    await screen.findByRole('heading', { level: 1, name: 'Requests' });
    await user.click(screen.getByRole('link', { name: 'Request overtime' }));
    await screen.findByRole('heading', { level: 1, name: 'Request overtime' });
    fillForm();
    await pressSubmit(user);

    await screen.findByRole('heading', { level: 1, name: 'Requests' });
    expect(submit.submittedBodies.map((body) => body.idempotencyKey)).toEqual([
      FIRST_KEY,
      SECOND_KEY,
    ]);
  });
});

describe('overtime request busy state', () => {
  it('should disable submit and send one request when submit is pressed again while the first is in flight', async () => {
    let releaseResponse: () => void = () => undefined;
    const responseReleased = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    const submit = submitEndpoint(async () => {
      await responseReleased;
      return HttpResponse.json(CREATED_REQUEST, { status: 201 });
    });
    mswServer.use(
      submit.handler,
      listEndpoint(() => []),
    );
    const { user } = await openOvertimeForm();

    fillForm();
    await pressSubmit(user);

    const submitButton = await screen.findByRole('button', { name: 'Submit request' });
    expect(submitButton).toBeDisabled();
    expect(submitButton).toHaveAttribute('aria-busy', 'true');
    const form = submitButton.closest('form');
    if (form === null) throw new Error('The submit button is not inside the form.');
    fireEvent.submit(form);
    await user.click(submitButton);
    expect(submit.submittedBodies).toHaveLength(1);

    releaseResponse();
    await screen.findByRole('heading', { level: 1, name: 'Requests' });
    expect(submit.submittedBodies).toHaveLength(1);
  });
});

describe('overtime request fields', () => {
  it('should limit the business date to seven days back through today in WIB, with today selected', async () => {
    mswServer.use(listEndpoint(() => []));
    await openOvertimeForm();

    const businessDateInput = field('Business date');
    expect(businessDateInput).toHaveAttribute('min', '2026-10-26');
    expect(businessDateInput).toHaveAttribute('max', TODAY);
    expect(businessDateInput).toHaveValue(TODAY);
  });

  it('should label the reason as required and count its characters against the limit', async () => {
    mswServer.use(listEndpoint(() => []));
    await openOvertimeForm();

    setField('Reason', 'Deadline');

    const reasonInput = field('Reason');
    expect(reasonInput).toBeRequired();
    expect(reasonInput).toHaveAccessibleDescription('8 of 500 characters');
    expect(screen.getByText('required')).toBeInTheDocument();
  });
});
