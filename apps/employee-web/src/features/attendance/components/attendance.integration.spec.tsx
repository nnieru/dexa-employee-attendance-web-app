import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import type { TodayAttendanceResponse } from '@dexa/contracts';
import { mswServer } from '../../../test/msw-server.js';
import {
  EMPLOYEE_ACCOUNT,
  accountCheckSucceeds,
  loginSucceeds,
  renderEmployeeApp,
  signInWith,
} from '../../../test/employee-app-harness.js';
import { SCHEDULE_NOT_CONFIGURED_MESSAGE } from '../utils/attendance-copy.js';

const TODAY_URL = '/api/v1/attendance/me/today';
const CLOCK_IN_URL = '/api/v1/attendance/clock-in';
const CLOCK_OUT_URL = '/api/v1/attendance/clock-out';

const WORKING_DAY = {
  businessDate: '2026-11-02',
  isWorkingDay: true,
  scheduledStartAt: '2026-11-02T02:00:00.000Z',
  scheduledEndAt: '2026-11-02T11:00:00.000Z',
} as const;
const DAY_OFF = {
  businessDate: '2026-11-01',
  isWorkingDay: false,
  scheduledStartAt: null,
  scheduledEndAt: null,
} as const;

const NOT_CLOCKED_IN: TodayAttendanceResponse = {
  ...WORKING_DAY,
  state: { status: 'NOT_CLOCKED_IN' },
};
const LATE_CLOCKED_IN: TodayAttendanceResponse = {
  ...WORKING_DAY,
  state: {
    status: 'CLOCKED_IN',
    clockInAt: '2026-11-02T02:20:00.000Z',
    clockInStatus: 'LATE_CHECKIN',
  },
};
const DONE_FOR_DAY: TodayAttendanceResponse = {
  ...WORKING_DAY,
  state: {
    status: 'DONE',
    clockInAt: '2026-11-02T01:58:00.000Z',
    clockInStatus: 'ON_TIME_CHECKIN',
    clockOutAt: '2026-11-02T10:00:00.000Z',
    clockOutStatus: 'EARLY_CHECKOUT',
  },
};
const DAY_OFF_CLOCKED_IN: TodayAttendanceResponse = {
  ...DAY_OFF,
  state: {
    status: 'CLOCKED_IN',
    clockInAt: '2026-11-01T01:00:00.000Z',
    clockInStatus: 'CHECKIN_NOT_REQUIRED',
  },
};

const ALREADY_CLOCKED_IN_MESSAGE = 'You have already clocked in today.';
const NETWORK_ERROR_MESSAGE = 'The server could not be reached. Try again.';

beforeEach(() => {
  mswServer.use(loginSucceeds(), accountCheckSucceeds());
});

/** Today's state that the test can change, so a refetch after a punch shows what the server now holds. */
function storedToday(initial: TodayAttendanceResponse) {
  let stored = initial;
  const reads = { count: 0 };
  return {
    reads,
    handler: http.get(TODAY_URL, () => {
      reads.count += 1;
      return HttpResponse.json(stored);
    }),
    store(next: TodayAttendanceResponse) {
      stored = next;
    },
  };
}

/**
 * A punch endpoint that records each request body and answers with the given response. The response waits for
 * `responseGate`, so a test can hold the request open while the action is pending.
 */
function punchEndpoint(
  url: string,
  respond: () => Response,
  responseGate: Promise<void> = Promise.resolve(),
) {
  const requestBodies: string[] = [];
  return {
    requestBodies,
    handler: http.post(url, async ({ request }) => {
      requestBodies.push(await request.text());
      await responseGate;
      return respond();
    }),
  };
}

async function openAttendanceAsSignedInEmployee() {
  const user = userEvent.setup();
  await renderEmployeeApp('/login');
  await signInWith(user, EMPLOYEE_ACCOUNT.email);
  await screen.findByRole('heading', { level: 1, name: 'Attendance' });
  return { user };
}

describe('attendance panel states', () => {
  it('should offer clock in and show no punch times when the employee is not clocked in', async () => {
    mswServer.use(storedToday(NOT_CLOCKED_IN).handler);
    await openAttendanceAsSignedInEmployee();

    expect(await screen.findByRole('button', { name: 'Clock in' })).toBeEnabled();
    expect(screen.getAllByText('Not recorded yet')).toHaveLength(2);
    expect(screen.getByText('09:00 WIB to 18:00 WIB')).toBeInTheDocument();
    expect(screen.queryByText('Late clock-in')).not.toBeInTheDocument();
  });

  it('should offer clock out with the server time and late label when the employee is clocked in', async () => {
    mswServer.use(storedToday(LATE_CLOCKED_IN).handler);
    await openAttendanceAsSignedInEmployee();

    expect(await screen.findByRole('button', { name: 'Clock out' })).toBeEnabled();
    expect(screen.getByText('09:20 WIB')).toBeInTheDocument();
    expect(screen.getByText('Late clock-in')).toBeInTheDocument();
    expect(screen.getByText('Not recorded yet')).toBeInTheDocument();
  });

  it('should disable the action and show both classifications when the day is done', async () => {
    mswServer.use(storedToday(DONE_FOR_DAY).handler);
    await openAttendanceAsSignedInEmployee();

    expect(await screen.findByRole('button', { name: 'Clock out' })).toBeDisabled();
    expect(screen.getByText('08:58 WIB')).toBeInTheDocument();
    expect(screen.getByText('On-time clock-in')).toBeInTheDocument();
    expect(screen.getByText('17:00 WIB')).toBeInTheDocument();
    expect(screen.getByText('Early clock-out')).toBeInTheDocument();
  });

  it('should show the day off and the not-required label on a day off', async () => {
    mswServer.use(storedToday(DAY_OFF_CLOCKED_IN).handler);
    await openAttendanceAsSignedInEmployee();

    expect(await screen.findByText('Day off')).toBeInTheDocument();
    expect(screen.getByText('Not required')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clock out' })).toBeEnabled();
  });
});

describe('attendance punches', () => {
  it('should send an empty body and show the server time when clock in succeeds', async () => {
    const today = storedToday(NOT_CLOCKED_IN);
    const punches = punchEndpoint(CLOCK_IN_URL, () => {
      today.store(LATE_CLOCKED_IN);
      return HttpResponse.json({
        type: 'IN',
        recordedAt: '2026-11-02T02:20:00.000Z',
        businessDate: '2026-11-02',
        classification: 'LATE_CHECKIN',
      });
    });
    mswServer.use(today.handler, punches.handler);
    const { user } = await openAttendanceAsSignedInEmployee();

    await user.click(await screen.findByRole('button', { name: 'Clock in' }));

    expect(await screen.findByText('Clocked in at 09:20 WIB.')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Clock out' })).toBeEnabled();
    expect(punches.requestBodies).toEqual(['']);
  });

  it('should show the server time when clock out succeeds', async () => {
    const today = storedToday(LATE_CLOCKED_IN);
    const punches = punchEndpoint(CLOCK_OUT_URL, () => {
      today.store(DONE_FOR_DAY);
      return HttpResponse.json({
        type: 'OUT',
        recordedAt: '2026-11-02T10:00:00.000Z',
        businessDate: '2026-11-02',
        classification: 'EARLY_CHECKOUT',
      });
    });
    mswServer.use(today.handler, punches.handler);
    const { user } = await openAttendanceAsSignedInEmployee();

    await user.click(await screen.findByRole('button', { name: 'Clock out' }));

    expect(await screen.findByText('Clocked out at 17:00 WIB.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clock out' })).toBeDisabled();
    expect(punches.requestBodies).toEqual(['']);
  });

  it('should disable the action while the punch is sent', async () => {
    const today = storedToday(NOT_CLOCKED_IN);
    let releaseResponse: () => void = () => undefined;
    const responseReleased = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    const punches = punchEndpoint(
      CLOCK_IN_URL,
      () => {
        today.store(LATE_CLOCKED_IN);
        return HttpResponse.json({
          type: 'IN',
          recordedAt: '2026-11-02T02:20:00.000Z',
          businessDate: '2026-11-02',
          classification: 'LATE_CHECKIN',
        });
      },
      responseReleased,
    );
    mswServer.use(today.handler, punches.handler);
    const { user } = await openAttendanceAsSignedInEmployee();

    await user.click(await screen.findByRole('button', { name: 'Clock in' }));

    const pendingButton = screen.getByRole('button', { name: 'Clock in' });
    expect(pendingButton).toBeDisabled();
    expect(pendingButton).toHaveAttribute('aria-busy', 'true');

    await act(async () => {
      releaseResponse();
    });
    expect(await screen.findByRole('button', { name: 'Clock out' })).toBeEnabled();
  });

  it('should refresh today and show the conflict without retrying when clock in is refused with 409', async () => {
    const today = storedToday(NOT_CLOCKED_IN);
    const punches = punchEndpoint(CLOCK_IN_URL, () => {
      today.store(LATE_CLOCKED_IN);
      return HttpResponse.json(
        {
          statusCode: 409,
          code: 'ATTENDANCE_ALREADY_CLOCKED_IN',
          message: ALREADY_CLOCKED_IN_MESSAGE,
        },
        { status: 409 },
      );
    });
    mswServer.use(today.handler, punches.handler);
    const { user } = await openAttendanceAsSignedInEmployee();
    const readsBeforePunch = today.reads.count;

    await user.click(await screen.findByRole('button', { name: 'Clock in' }));

    expect(await screen.findByText(ALREADY_CLOCKED_IN_MESSAGE)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Clock out' })).toBeEnabled();
    expect(today.reads.count).toBeGreaterThan(readsBeforePunch);
    expect(punches.requestBodies).toHaveLength(1);
  });

  it('should refresh today and show the recorded state when the clock-in response is lost', async () => {
    const today = storedToday(NOT_CLOCKED_IN);
    const punches = punchEndpoint(CLOCK_IN_URL, () => {
      // The punch is stored, but the response never arrives: the screen must show what the server holds.
      today.store(LATE_CLOCKED_IN);
      return HttpResponse.error();
    });
    mswServer.use(today.handler, punches.handler);
    const { user } = await openAttendanceAsSignedInEmployee();

    await user.click(await screen.findByRole('button', { name: 'Clock in' }));

    expect(await screen.findByText(NETWORK_ERROR_MESSAGE)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Clock out' })).toBeEnabled();
    expect(punches.requestBodies).toHaveLength(1);
  });

  it('should tell the employee to contact HR when clock in is refused because no schedule is set', async () => {
    const today = storedToday(NOT_CLOCKED_IN);
    const punches = punchEndpoint(CLOCK_IN_URL, () =>
      HttpResponse.json(
        {
          statusCode: 409,
          code: 'SCHEDULE_NOT_CONFIGURED',
          message: 'Work schedule not found. The punch was not recorded.',
        },
        { status: 409 },
      ),
    );
    mswServer.use(today.handler, punches.handler);
    const { user } = await openAttendanceAsSignedInEmployee();

    await user.click(await screen.findByRole('button', { name: 'Clock in' }));

    expect(await screen.findByText(SCHEDULE_NOT_CONFIGURED_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText(/^Clocked in at/)).not.toBeInTheDocument();
  });
});

describe('attendance read errors', () => {
  it('should tell the employee to contact HR and offer no punch when today has no schedule', async () => {
    mswServer.use(
      http.get(TODAY_URL, () =>
        HttpResponse.json(
          { statusCode: 409, code: 'SCHEDULE_NOT_CONFIGURED', message: 'Work schedule not found.' },
          { status: 409 },
        ),
      ),
    );
    await openAttendanceAsSignedInEmployee();

    expect(await screen.findByText(SCHEDULE_NOT_CONFIGURED_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clock in' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('should load today again when the employee tries again after a failed read', async () => {
    let readCount = 0;
    mswServer.use(
      http.get(TODAY_URL, () => {
        readCount += 1;
        if (readCount === 1) {
          return HttpResponse.json(
            {
              statusCode: 500,
              code: 'INTERNAL_ERROR',
              message: 'Something went wrong. Try again.',
            },
            { status: 500 },
          );
        }
        return HttpResponse.json(NOT_CLOCKED_IN);
      }),
    );
    const { user } = await openAttendanceAsSignedInEmployee();

    expect(await screen.findByText('Your attendance could not be loaded.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('button', { name: 'Clock in' })).toBeEnabled();
    expect(readCount).toBe(2);
  });
});
