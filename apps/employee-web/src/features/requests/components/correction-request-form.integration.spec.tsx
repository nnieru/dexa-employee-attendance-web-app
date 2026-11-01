import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCode, type AttendanceSummaryItem, type CorrectionRequest } from '@dexa/contracts';
import { mswServer } from '../../../test/msw-server.js';
import {
  EMPLOYEE_ACCOUNT,
  accountCheckSucceeds,
  loginSucceeds,
  renderEmployeeApp,
  signInWith,
} from '../../../test/employee-app-harness.js';
import {
  CORRECTION_ALREADY_PENDING_MESSAGE,
  CORRECTION_CLOCK_IN_HINT,
  CORRECTION_REQUEST_SUBMITTED_MESSAGE,
  CORRECTION_SCHEDULE_NOT_CONFIGURED_MESSAGE,
  CURRENT_RECORD_CHOOSE_DATE_MESSAGE,
  CURRENT_RECORD_EMPTY_MESSAGE,
  CURRENT_RECORD_LOAD_ERROR_MESSAGE,
  OVERTIME_IDEMPOTENCY_CONFLICT_MESSAGE,
} from '../utils/requests-messages.js';
import { CORRECTION_FORM_MESSAGES } from '../utils/correction-request-form.schema.js';

const CORRECTION_SUBMIT_URL = '/api/v1/attendance-corrections';
const CORRECTION_LIST_URL = '/api/v1/attendance-corrections/me';
const DAY_RECORD_URL = '/api/v1/attendance/me';
const FIRST_KEY = '3c1f7e2a-9d4b-4a6e-8f0c-5b2d1e9a7c01';
const SECOND_KEY = '3c1f7e2a-9d4b-4a6e-8f0c-5b2d1e9a7c02';

// 18:00 UTC on 1 November is 01:00 WIB on 2 November: today in WIB is 2 November, while the UTC date is still 1 November.
const NOW_IN_WIB_2_NOVEMBER = new Date('2026-11-01T18:00:00.000Z');
const TODAY = '2026-11-02';
const DEFAULT_REASON = 'Forgot to clock in after the VPN outage';
const CLOCK_IN_TIME = '09:00';
const CLOCK_IN_INSTANT = '2026-11-02T02:00:00.000Z';
const CLOCK_OUT_TIME = '17:30';
const CLOCK_OUT_INSTANT = '2026-11-02T10:30:00.000Z';

const CREATED_REQUEST: CorrectionRequest = {
  id: '3c1f7e2a-9d4b-4a6e-8f0c-5b2d1e9a7c20',
  businessDate: TODAY,
  requestedDayStatus: 'PRESENT',
  clockInAt: CLOCK_IN_INSTANT,
  clockOutAt: null,
  reason: DEFAULT_REASON,
  status: 'PENDING',
  reviewReason: null,
  reviewedAt: null,
  createdAt: '2026-11-01T18:00:00.000Z',
};

const PUNCHED_DAY: AttendanceSummaryItem = {
  businessDate: TODAY,
  dayStatus: 'PRESENT',
  approvedOvertimeMinutes: 90,
  clockInAt: CLOCK_IN_INSTANT,
  clockInStatus: 'ON_TIME_CHECKIN',
  clockOutAt: CLOCK_OUT_INSTANT,
  clockOutStatus: 'LATE_CHECKOUT',
};

type SubmitBody = Record<string, unknown>;

function errorResponse(status: number, code: string, message: string) {
  return HttpResponse.json({ statusCode: status, code, message }, { status });
}

function summaryPage(items: ReadonlyArray<AttendanceSummaryItem>) {
  return { items, page: 1, pageSize: 1, totalItems: items.length, totalPages: 1 };
}

function correctionListPage() {
  return { items: [], page: 1, pageSize: 20, totalItems: 0, totalPages: 0 };
}

/** Answers each submission in turn and keeps the bodies, so a test can read what was sent. */
function submitEndpoint(
  respond: (body: SubmitBody, attemptIndex: number) => Response | Promise<Response>,
) {
  const submittedBodies: SubmitBody[] = [];
  return {
    submittedBodies,
    handler: http.post(CORRECTION_SUBMIT_URL, async ({ request }) => {
      const body = (await request.json()) as SubmitBody;
      submittedBodies.push(body);
      return respond(body, submittedBodies.length - 1);
    }),
  };
}

/** Answers the own record read and keeps each query, so a test can check the single-date request. */
function dayRecordEndpoint(
  respond: (date: string) => Response = () => HttpResponse.json(summaryPage([])),
) {
  const requestedQueries: URLSearchParams[] = [];
  return {
    requestedQueries,
    handler: http.get(DAY_RECORD_URL, ({ request }) => {
      const query = new URL(request.url).searchParams;
      requestedQueries.push(query);
      return respond(query.get('from') ?? '');
    }),
  };
}

function correctionListEndpoint() {
  return http.get(CORRECTION_LIST_URL, () => HttpResponse.json(correctionListPage()));
}

/** Signs in and opens the correction form at `path`, through the login redirect the app uses for protected pages. */
async function openCorrectionForm(path = '/requests/corrections/new', queryClient?: QueryClient) {
  const user = userEvent.setup();
  const router = await renderEmployeeApp(
    `/login?redirect=${encodeURIComponent(path)}`,
    queryClient,
  );
  await signInWith(user, EMPLOYEE_ACCOUNT.email);
  await screen.findByRole('heading', { level: 1, name: 'Request correction' });
  return { user, router };
}

function field(label: string): HTMLElement {
  return screen.getByLabelText(label);
}

function setField(label: string, value: string) {
  fireEvent.change(field(label), { target: { value } });
}

/** Fills the form as a present day with a clock-in, unless a test overrides an entry. */
function fillPresentForm(
  overrides: Partial<
    Record<'businessDate' | 'clockInTime' | 'clockOutTime' | 'reason', string>
  > = {},
) {
  setField('Business date', overrides.businessDate ?? TODAY);
  setField('Clock in (WIB)', overrides.clockInTime ?? CLOCK_IN_TIME);
  if (overrides.clockOutTime !== undefined) setField('Clock out (WIB)', overrides.clockOutTime);
  setField('Reason', overrides.reason ?? DEFAULT_REASON);
}

async function chooseOutcome(user: ReturnType<typeof userEvent.setup>, outcome: string) {
  await user.click(screen.getByRole('radio', { name: outcome }));
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
  mswServer.use(
    loginSucceeds(),
    accountCheckSucceeds(),
    dayRecordEndpoint().handler,
    correctionListEndpoint(),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('correction request submission', () => {
  it('should send the exact Present body with the WIB clock-in, no clock-out key, and one idempotency key', async () => {
    const submit = submitEndpoint(() => HttpResponse.json(CREATED_REQUEST, { status: 201 }));
    mswServer.use(submit.handler);
    const { user } = await openCorrectionForm();

    fillPresentForm();
    await pressSubmit(user);

    await screen.findByRole('heading', { level: 1, name: 'Requests' });
    expect(submit.submittedBodies).toStrictEqual([
      {
        requestedDayStatus: 'PRESENT',
        businessDate: TODAY,
        clockInAt: CLOCK_IN_INSTANT,
        reason: DEFAULT_REASON,
        idempotencyKey: FIRST_KEY,
      },
    ]);
  });

  it('should send the clock-out as a WIB instant as well when one is entered', async () => {
    const submit = submitEndpoint(() => HttpResponse.json(CREATED_REQUEST, { status: 201 }));
    mswServer.use(submit.handler);
    const { user } = await openCorrectionForm();

    fillPresentForm({ clockOutTime: CLOCK_OUT_TIME });
    await pressSubmit(user);

    await screen.findByRole('heading', { level: 1, name: 'Requests' });
    expect(submit.submittedBodies[0]).toStrictEqual({
      requestedDayStatus: 'PRESENT',
      businessDate: TODAY,
      clockInAt: CLOCK_IN_INSTANT,
      clockOutAt: CLOCK_OUT_INSTANT,
      reason: DEFAULT_REASON,
      idempotencyKey: FIRST_KEY,
    });
  });

  it.each([
    ['Sick leave', 'SICK_LEAVE'],
    ['Leave', 'LEAVE'],
  ])(
    'should send no time keys for %s, even when times were typed before the outcome changed',
    async (outcome, requestedDayStatus) => {
      const submit = submitEndpoint(() =>
        HttpResponse.json(
          { ...CREATED_REQUEST, requestedDayStatus, clockInAt: null },
          { status: 201 },
        ),
      );
      mswServer.use(submit.handler);
      const { user } = await openCorrectionForm();

      fillPresentForm({ clockOutTime: CLOCK_OUT_TIME });
      await chooseOutcome(user, outcome);
      await pressSubmit(user);

      await screen.findByRole('heading', { level: 1, name: 'Requests' });
      expect(submit.submittedBodies).toStrictEqual([
        {
          requestedDayStatus,
          businessDate: TODAY,
          reason: DEFAULT_REASON,
          idempotencyKey: FIRST_KEY,
        },
      ]);
    },
  );

  it('should show the success message and open the corrections tab when the server accepts the request', async () => {
    const submit = submitEndpoint(() => HttpResponse.json(CREATED_REQUEST, { status: 201 }));
    mswServer.use(submit.handler);
    const { user, router } = await openCorrectionForm();

    fillPresentForm();
    await pressSubmit(user);

    expect(await screen.findByText(CORRECTION_REQUEST_SUBMITTED_MESSAGE)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/requests');
    expect(router.state.location.search).toEqual({ tab: 'corrections' });
  });

  it('should invalidate the own correction lists and the single-date record when the request is accepted', async () => {
    const submit = submitEndpoint(() => HttpResponse.json(CREATED_REQUEST, { status: 201 }));
    mswServer.use(submit.handler);
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { user } = await openCorrectionForm('/requests/corrections/new', queryClient);

    fillPresentForm();
    await pressSubmit(user);

    await screen.findByRole('heading', { level: 1, name: 'Requests' });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['requests', 'own', 'corrections'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['requests', 'own', 'day-attendance'] });
  });
});

describe('correction request client validation', () => {
  it.each([
    [
      'a present day with no clock-in',
      { clockInTime: '' },
      'Clock in (WIB)',
      CORRECTION_FORM_MESSAGES.clockInRequired,
    ],
    [
      'a clock-out equal to the clock-in',
      { clockOutTime: CLOCK_IN_TIME },
      'Clock out (WIB)',
      'Clock-out must be after clock-in.',
    ],
    [
      'a clock-out before the clock-in',
      { clockOutTime: '08:30' },
      'Clock out (WIB)',
      'Clock-out must be after clock-in.',
    ],
    ['an empty reason', { reason: '' }, 'Reason', CORRECTION_FORM_MESSAGES.reasonRequired],
    ['a blank reason', { reason: '   ' }, 'Reason', CORRECTION_FORM_MESSAGES.reasonRequired],
    [
      'a reason of 501 characters',
      { reason: 'x'.repeat(501) },
      'Reason',
      CORRECTION_FORM_MESSAGES.reasonTooLong,
    ],
    [
      'a business date 31 days back',
      { businessDate: '2026-10-02' },
      'Business date',
      CORRECTION_FORM_MESSAGES.businessDateOutsideWindow,
    ],
  ])(
    'should show the field message and send nothing for %s',
    async (_description, overrides, label, message) => {
      const submit = submitEndpoint(() => HttpResponse.json(CREATED_REQUEST, { status: 201 }));
      mswServer.use(submit.handler);
      const { user } = await openCorrectionForm();

      fillPresentForm(overrides);
      await pressSubmit(user);

      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(field(label)).toHaveAttribute('aria-invalid', 'true');
      expect(field(label)).toHaveAccessibleDescription(expect.stringContaining(message));
      expect(submit.submittedBodies).toHaveLength(0);
      expect(randomUuidSpy).not.toHaveBeenCalled();
    },
  );

  it('should refuse a sick leave request whose reason is only spaces and send nothing', async () => {
    const submit = submitEndpoint(() => HttpResponse.json(CREATED_REQUEST, { status: 201 }));
    mswServer.use(submit.handler);
    const { user } = await openCorrectionForm();

    fillPresentForm({ reason: '   ' });
    await chooseOutcome(user, 'Sick leave');
    await pressSubmit(user);

    expect(await screen.findByText(CORRECTION_FORM_MESSAGES.reasonRequired)).toBeInTheDocument();
    expect(submit.submittedBodies).toHaveLength(0);
  });
});

describe('correction request outcome fields', () => {
  it('should hide the time fields for sick leave and leave, and show them again for present', async () => {
    const { user } = await openCorrectionForm();

    expect(field('Clock in (WIB)')).toBeInTheDocument();
    await chooseOutcome(user, 'Sick leave');
    expect(screen.queryByLabelText('Clock in (WIB)')).toBeNull();
    expect(screen.queryByLabelText('Clock out (WIB)')).toBeNull();
    await chooseOutcome(user, 'Leave');
    expect(screen.queryByLabelText('Clock in (WIB)')).toBeNull();
    await chooseOutcome(user, 'Present');
    expect(field('Clock in (WIB)')).toHaveValue('');
    expect(field('Clock out (WIB)')).toHaveValue('');
  });

  it('should group the outcome radios in a fieldset with the Present outcome selected by default', async () => {
    await openCorrectionForm();

    const outcomeGroup = screen.getByRole('group', { name: 'Requested outcome' });
    expect(within(outcomeGroup).getByRole('radio', { name: 'Present' })).toBeChecked();
    expect(within(outcomeGroup).getByRole('radio', { name: 'Sick leave' })).not.toBeChecked();
    expect(within(outcomeGroup).getByRole('radio', { name: 'Leave' })).not.toBeChecked();
  });

  it('should show the clock-in hint and count the reason characters against the limit', async () => {
    await openCorrectionForm();

    expect(field('Clock in (WIB)')).toHaveAccessibleDescription(
      expect.stringContaining(CORRECTION_CLOCK_IN_HINT),
    );
    setField('Reason', 'Deadline');
    expect(field('Reason')).toBeRequired();
    expect(field('Reason')).toHaveAccessibleDescription('8 of 500 characters');
  });

  it('should limit the business date to thirty days back through today in WIB, with today selected', async () => {
    await openCorrectionForm();

    const businessDateInput = field('Business date');
    expect(businessDateInput).toHaveAttribute('min', '2026-10-03');
    expect(businessDateInput).toHaveAttribute('max', TODAY);
    expect(businessDateInput).toHaveValue(TODAY);
  });

  it('should pre-fill the business date from the date in the URL and show that day in the record heading', async () => {
    mswServer.use(dayRecordEndpoint(() => HttpResponse.json(summaryPage([]))).handler);
    await openCorrectionForm('/requests/corrections/new?date=2026-10-20');

    expect(field('Business date')).toHaveValue('2026-10-20');
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Current record for 2026-10-20' }),
    ).toBeInTheDocument();
  });

  it.each([
    ['a date outside the window', '2026-09-01'],
    ['a date that is not a calendar date', 'not-a-date'],
  ])('should ignore %s in the URL and open on today', async (_description, date) => {
    await openCorrectionForm(`/requests/corrections/new?date=${date}`);

    expect(field('Business date')).toHaveValue(TODAY);
  });
});

describe('correction request server refusals', () => {
  it('should show the already-pending message near the top and keep every entered value', async () => {
    mswServer.use(
      submitEndpoint(() =>
        errorResponse(409, ErrorCode.CORRECTION_ALREADY_PENDING, 'A pending correction exists.'),
      ).handler,
    );
    const { user } = await openCorrectionForm();

    fillPresentForm({ clockOutTime: CLOCK_OUT_TIME });
    await pressSubmit(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(CORRECTION_ALREADY_PENDING_MESSAGE);
    expect(screen.queryByText('A pending correction exists.')).toBeNull();
    expect(field('Clock in (WIB)')).toHaveValue(CLOCK_IN_TIME);
    expect(field('Clock out (WIB)')).toHaveValue(CLOCK_OUT_TIME);
    expect(field('Reason')).toHaveValue(DEFAULT_REASON);
    expect(field('Business date')).toHaveValue(TODAY);
  });

  it.each([
    [ErrorCode.CORRECTION_CLOCK_IN_REQUIRED, 'Clock in (WIB)'],
    [ErrorCode.CORRECTION_CLOCK_IN_OUTSIDE_BUSINESS_DATE, 'Clock in (WIB)'],
    [ErrorCode.CORRECTION_CLOCK_IN_IN_FUTURE, 'Clock in (WIB)'],
    [ErrorCode.CORRECTION_CLOCK_OUT_OUTSIDE_BUSINESS_DATE, 'Clock out (WIB)'],
    [ErrorCode.CORRECTION_CLOCK_OUT_IN_FUTURE, 'Clock out (WIB)'],
    [ErrorCode.CORRECTION_CLOCK_OUT_NOT_AFTER_CLOCK_IN, 'Clock out (WIB)'],
  ])('should show %s on the %s field with the server message', async (code, label) => {
    const message = 'The server says this time is not allowed.';
    mswServer.use(submitEndpoint(() => errorResponse(400, code, message)).handler);
    const { user } = await openCorrectionForm();

    fillPresentForm({ clockOutTime: CLOCK_OUT_TIME });
    await pressSubmit(user);

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(field(label)).toHaveAccessibleDescription(expect.stringContaining(message));
    expect(field('Reason')).toHaveValue(DEFAULT_REASON);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('should show the business date window refusal on the business date field', async () => {
    const message = 'Corrections can be requested for today or up to 30 days back.';
    mswServer.use(
      submitEndpoint(() =>
        errorResponse(400, ErrorCode.CORRECTION_BUSINESS_DATE_OUTSIDE_WINDOW, message),
      ).handler,
    );
    const { user } = await openCorrectionForm();

    fillPresentForm();
    await pressSubmit(user);

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(field('Business date')).toHaveAccessibleDescription(expect.stringContaining(message));
    expect(field('Business date')).toHaveValue(TODAY);
  });

  it('should show the leave-times refusal in the general alert and keep the values', async () => {
    const message = 'A sick leave or leave correction cannot carry times.';
    mswServer.use(
      submitEndpoint(() =>
        errorResponse(400, ErrorCode.CORRECTION_TIMES_NOT_ALLOWED_FOR_LEAVE, message),
      ).handler,
    );
    const { user } = await openCorrectionForm();

    fillPresentForm();
    await chooseOutcome(user, 'Leave');
    await pressSubmit(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(field('Reason')).toHaveValue(DEFAULT_REASON);
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
    const { user } = await openCorrectionForm();

    fillPresentForm();
    await pressSubmit(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      OVERTIME_IDEMPOTENCY_CONFLICT_MESSAGE,
    );
    expect(field('Reason')).toHaveValue(DEFAULT_REASON);
  });

  it('should tell the employee the schedule is not set up in the general alert when the server has no schedule', async () => {
    mswServer.use(
      submitEndpoint(() =>
        errorResponse(409, ErrorCode.SCHEDULE_NOT_CONFIGURED, 'No work schedule covers this date.'),
      ).handler,
    );
    const { user } = await openCorrectionForm();

    fillPresentForm();
    await pressSubmit(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      CORRECTION_SCHEDULE_NOT_CONFIGURED_MESSAGE,
    );
    expect(field('Clock in (WIB)')).toHaveValue(CLOCK_IN_TIME);
  });

  it('should show the server message in the general alert and keep the values for another failure', async () => {
    mswServer.use(
      submitEndpoint(() =>
        errorResponse(500, ErrorCode.INTERNAL_ERROR, 'Something went wrong. Try again.'),
      ).handler,
    );
    const { user } = await openCorrectionForm();

    fillPresentForm();
    await pressSubmit(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Try again.');
    expect(field('Reason')).toHaveValue(DEFAULT_REASON);
    expect(field('Clock in (WIB)')).toHaveValue(CLOCK_IN_TIME);
  });
});

describe('correction request idempotency key', () => {
  it('should send the same key on a retry with identical values after a server failure', async () => {
    const submit = submitEndpoint((_body, attemptIndex) =>
      attemptIndex === 0
        ? errorResponse(500, ErrorCode.INTERNAL_ERROR, 'Something went wrong. Try again.')
        : HttpResponse.json(CREATED_REQUEST, { status: 201 }),
    );
    mswServer.use(submit.handler);
    const { user } = await openCorrectionForm();

    fillPresentForm();
    await pressSubmit(user);
    await screen.findByRole('alert');
    await pressSubmit(user);

    await screen.findByRole('heading', { level: 1, name: 'Requests' });
    expect(submit.submittedBodies.map((body) => body.idempotencyKey)).toEqual([
      FIRST_KEY,
      FIRST_KEY,
    ]);
    expect(randomUuidSpy).toHaveBeenCalledTimes(1);
  });

  it('should send a new key on a retry after a value changed', async () => {
    const submit = submitEndpoint((_body, attemptIndex) =>
      attemptIndex === 0
        ? errorResponse(500, ErrorCode.INTERNAL_ERROR, 'Something went wrong. Try again.')
        : HttpResponse.json(CREATED_REQUEST, { status: 201 }),
    );
    mswServer.use(submit.handler);
    const { user } = await openCorrectionForm();

    fillPresentForm();
    await pressSubmit(user);
    await screen.findByRole('alert');
    setField('Clock in (WIB)', '08:45');
    await pressSubmit(user);

    await screen.findByRole('heading', { level: 1, name: 'Requests' });
    expect(submit.submittedBodies[0]?.idempotencyKey).toBe(FIRST_KEY);
    expect(submit.submittedBodies[1]).toMatchObject({
      clockInAt: '2026-11-02T01:45:00.000Z',
      idempotencyKey: SECOND_KEY,
    });
    expect(randomUuidSpy).toHaveBeenCalledTimes(2);
  });

  it('should send a new key when the outcome changed to leave after a failure', async () => {
    const submit = submitEndpoint((_body, attemptIndex) =>
      attemptIndex === 0
        ? errorResponse(500, ErrorCode.INTERNAL_ERROR, 'Something went wrong. Try again.')
        : HttpResponse.json(CREATED_REQUEST, { status: 201 }),
    );
    mswServer.use(submit.handler);
    const { user } = await openCorrectionForm();

    fillPresentForm();
    await pressSubmit(user);
    await screen.findByRole('alert');
    await chooseOutcome(user, 'Leave');
    await pressSubmit(user);

    await screen.findByRole('heading', { level: 1, name: 'Requests' });
    expect(submit.submittedBodies[1]).toStrictEqual({
      requestedDayStatus: 'LEAVE',
      businessDate: TODAY,
      reason: DEFAULT_REASON,
      idempotencyKey: SECOND_KEY,
    });
  });

  it('should not count a refused form as an attempt, so the first valid send uses the first key', async () => {
    const submit = submitEndpoint(() => HttpResponse.json(CREATED_REQUEST, { status: 201 }));
    mswServer.use(submit.handler);
    const { user } = await openCorrectionForm();

    fillPresentForm({ clockInTime: '' });
    await pressSubmit(user);
    expect(await screen.findByText(CORRECTION_FORM_MESSAGES.clockInRequired)).toBeInTheDocument();
    setField('Clock in (WIB)', CLOCK_IN_TIME);
    await pressSubmit(user);

    await screen.findByRole('heading', { level: 1, name: 'Requests' });
    expect(submit.submittedBodies.map((body) => body.idempotencyKey)).toEqual([FIRST_KEY]);
    expect(randomUuidSpy).toHaveBeenCalledTimes(1);
  });
});

describe('correction request busy state', () => {
  it('should disable submit and send one request when submit is pressed again while the first is in flight', async () => {
    let releaseResponse: () => void = () => undefined;
    const responseReleased = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    const submit = submitEndpoint(async () => {
      await responseReleased;
      return HttpResponse.json(CREATED_REQUEST, { status: 201 });
    });
    mswServer.use(submit.handler);
    const { user } = await openCorrectionForm();

    fillPresentForm();
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

describe('current record beside the correction form', () => {
  it('should show the punched day in WIB with its status, classifications, and approved overtime', async () => {
    const days = dayRecordEndpoint(() => HttpResponse.json(summaryPage([PUNCHED_DAY])));
    mswServer.use(days.handler);
    await openCorrectionForm();

    const panel = (
      await screen.findByRole('heading', { level: 2, name: 'Current record for 2026-11-02' })
    ).closest('section');
    if (panel === null) throw new Error('The current record panel is not a section.');
    expect(within(panel).getByText('09:00')).toBeInTheDocument();
    expect(within(panel).getByText('On-time clock-in')).toBeInTheDocument();
    expect(within(panel).getByText('17:30')).toBeInTheDocument();
    expect(within(panel).getByText('Late clock-out')).toBeInTheDocument();
    expect(within(panel).getByText('Present')).toBeInTheDocument();
    expect(within(panel).getByText('90 min')).toBeInTheDocument();
  });

  it('should show "Not recorded" for a missing time and hide approved overtime when it is zero', async () => {
    const clockInOnly: AttendanceSummaryItem = {
      ...PUNCHED_DAY,
      approvedOvertimeMinutes: 0,
      clockOutAt: null,
      clockOutStatus: 'PENDING_CHECKOUT',
    };
    mswServer.use(dayRecordEndpoint(() => HttpResponse.json(summaryPage([clockInOnly]))).handler);
    await openCorrectionForm();

    const panel = (
      await screen.findByRole('heading', { level: 2, name: /Current record/ })
    ).closest('section');
    if (panel === null) throw new Error('The current record panel is not a section.');
    expect(within(panel).getByText('Not recorded')).toBeInTheDocument();
    expect(within(panel).queryByText(/Approved overtime/)).toBeNull();
  });

  it('should show the no-record message when the employee has no row for the date', async () => {
    mswServer.use(dayRecordEndpoint(() => HttpResponse.json(summaryPage([]))).handler);
    await openCorrectionForm();

    expect(await screen.findByText(CURRENT_RECORD_EMPTY_MESSAGE)).toBeInTheDocument();
  });

  it('should show the error with Try again, keep the form usable, and load the record on retry', async () => {
    let isFirstRequest = true;
    const days = dayRecordEndpoint(() => {
      const shouldFail = isFirstRequest;
      isFirstRequest = false;
      return shouldFail
        ? errorResponse(500, ErrorCode.INTERNAL_ERROR, 'Failed.')
        : HttpResponse.json(summaryPage([PUNCHED_DAY]));
    });
    mswServer.use(days.handler);
    const { user } = await openCorrectionForm();

    expect(await screen.findByText(CURRENT_RECORD_LOAD_ERROR_MESSAGE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit request' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('90 min')).toBeInTheDocument();
    expect(days.requestedQueries).toHaveLength(2);
  });

  it('should ask for the single date with from and to set to it, and follow the date field', async () => {
    const days = dayRecordEndpoint((date) =>
      HttpResponse.json(summaryPage(date === TODAY ? [PUNCHED_DAY] : [])),
    );
    mswServer.use(days.handler);
    await openCorrectionForm();
    await screen.findByText('90 min');

    expect(days.requestedQueries[0]?.get('from')).toBe(TODAY);
    expect(days.requestedQueries[0]?.get('to')).toBe(TODAY);
    expect(days.requestedQueries[0]?.get('pageSize')).toBe('1');

    setField('Business date', '2026-10-20');

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Current record for 2026-10-20' }),
    ).toBeInTheDocument();
    expect(await screen.findByText(CURRENT_RECORD_EMPTY_MESSAGE)).toBeInTheDocument();
    expect(days.requestedQueries.at(-1)?.get('from')).toBe('2026-10-20');
    expect(days.requestedQueries.at(-1)?.get('to')).toBe('2026-10-20');
  });

  it('should ask the employee to choose a date and send no record request when the date is cleared', async () => {
    const days = dayRecordEndpoint(() => HttpResponse.json(summaryPage([PUNCHED_DAY])));
    mswServer.use(days.handler);
    await openCorrectionForm();
    await screen.findByText('90 min');
    const requestCount = days.requestedQueries.length;

    setField('Business date', '');

    expect(await screen.findByText(CURRENT_RECORD_CHOOSE_DATE_MESSAGE)).toBeInTheDocument();
    expect(days.requestedQueries).toHaveLength(requestCount);
  });
});
