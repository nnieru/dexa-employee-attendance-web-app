import { QueryClient } from '@tanstack/react-query';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mswServer } from '../../../test/msw-server.js';
import { accountCheckSucceeds, loginSucceeds } from '../../../test/admin-app-harness.js';
import {
  HOLIDAY_EXCEPTION,
  PAST_EXCEPTION,
  SPECIAL_WORKING_DAY_EXCEPTION,
  TODAY_EXCEPTION,
  buildCalendarExceptionPage,
} from '../../../test/calendar-exception-fixtures.js';
import {
  answerWithStatus,
  openCalendarExceptionsPage,
  recordCalendarListQueries,
  recordCalendarWrites,
} from '../../../test/calendar-exception-test-helpers.js';
import {
  CURRENT_VERSION,
  WORK_SCHEDULES_URL,
  buildWorkScheduleOverview,
} from '../../../test/work-schedule-fixtures.js';
import {
  ADD_DIALOG_TITLE,
  CALENDAR_LOAD_ERROR_MESSAGE,
  EDIT_DIALOG_TITLE,
  REMOVE_DIALOG_TITLE,
  REMOVE_SUCCESS_MESSAGE,
  RETRY_LABEL,
  SAVE_SUCCESS_MESSAGE,
} from '../utils/calendar-exception-messages.js';
import { DATE_TOO_EARLY_MESSAGE } from '../types/calendar-exception-form.schema.js';

// 20:00 UTC on 14 November is 03:00 WIB on 15 November: today in WIB is 15 November, so 16 November is the first editable date.
const NOW_IN_WIB_TODAY_15_NOVEMBER = new Date('2026-11-14T20:00:00.000Z');
const NOVEMBER_RANGE_PATH = '/schedule?from=2026-11-01&to=2026-11-30';
const FUTURE_RANGE_PATH = '/schedule?from=2026-11-16&to=2026-12-31';
const CALENDAR_REGION_NAME = 'Calendar exceptions in the selected range';

function getCalendarRegion(): HTMLElement {
  return screen.getByRole('region', { name: CALENDAR_REGION_NAME });
}

function getRowFor(date: string): HTMLElement {
  return within(getCalendarRegion()).getByRole('row', { name: new RegExp(date) });
}

function getDialog(name: string): HTMLElement {
  return screen.getByRole('dialog', { name });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW_IN_WIB_TODAY_15_NOVEMBER);
  mswServer.use(
    loginSucceeds(),
    accountCheckSucceeds(),
    http.get(WORK_SCHEDULES_URL, () =>
      HttpResponse.json(buildWorkScheduleOverview({ current: CURRENT_VERSION })),
    ),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe('listing calendar exceptions', () => {
  it('should list the exceptions of the range in the URL and send that range to the service', async () => {
    const queries = recordCalendarListQueries(() =>
      HttpResponse.json(
        buildCalendarExceptionPage([HOLIDAY_EXCEPTION, SPECIAL_WORKING_DAY_EXCEPTION]),
      ),
    );
    const { router } = await openCalendarExceptionsPage(FUTURE_RANGE_PATH);

    expect(await screen.findByText('Company holiday')).toBeInTheDocument();
    expect(getRowFor('2026-11-20')).toHaveTextContent('Holiday');
    expect(getRowFor('2026-11-28')).toHaveTextContent('Special working day');
    expect(queries.at(-1)?.get('from')).toBe('2026-11-16');
    expect(queries.at(-1)?.get('to')).toBe('2026-12-31');
    expect(queries.at(-1)?.get('page')).toBe('1');
    expect(router.state.location.href).toContain('from=2026-11-16&to=2026-12-31');
  });

  it('should list from tomorrow through the default end when the URL names no range', async () => {
    const queries = recordCalendarListQueries(() =>
      HttpResponse.json(buildCalendarExceptionPage([])),
    );
    await openCalendarExceptionsPage('/schedule');

    await screen.findByText('No calendar exceptions from 2026-11-16 to 2027-02-28.');
    expect(queries.at(-1)?.get('from')).toBe('2026-11-16');
    expect(queries.at(-1)?.get('to')).toBe('2027-02-28');
  });

  it('should show the empty message for a range with no exceptions', async () => {
    recordCalendarListQueries(() => HttpResponse.json(buildCalendarExceptionPage([])));
    await openCalendarExceptionsPage(FUTURE_RANGE_PATH);

    expect(
      await screen.findByText('No calendar exceptions from 2026-11-16 to 2026-12-31.'),
    ).toBeInTheDocument();
  });

  it('should show an error with a retry action and load the list when HR retries', async () => {
    let listAttempts = 0;
    recordCalendarListQueries(() => {
      listAttempts += 1;
      if (listAttempts === 1)
        return answerWithStatus(500, 'INTERNAL_ERROR', 'Something went wrong.');
      return HttpResponse.json(buildCalendarExceptionPage([HOLIDAY_EXCEPTION]));
    });
    const { user } = await openCalendarExceptionsPage(FUTURE_RANGE_PATH);

    expect(await screen.findByRole('alert')).toHaveTextContent(CALENDAR_LOAD_ERROR_MESSAGE);
    await user.click(screen.getByRole('button', { name: RETRY_LABEL }));
    expect(await screen.findByText('Company holiday')).toBeInTheDocument();
    expect(listAttempts).toBe(2);
  });

  it('should not send a list request for an out-of-order range and should explain why', async () => {
    const queries = recordCalendarListQueries(() =>
      HttpResponse.json(buildCalendarExceptionPage([])),
    );
    await openCalendarExceptionsPage('/schedule?from=2026-12-01&to=2026-11-30');

    expect(await screen.findByText('From must not be after To.')).toBeInTheDocument();
    expect(
      screen.getByText('Choose a valid date range to see calendar exceptions.'),
    ).toBeInTheDocument();
    expect(queries).toHaveLength(0);
  });
});

describe('adding a calendar exception', () => {
  it('should save a holiday for a future date with the date in the path and the body as the contract defines it', async () => {
    let served = buildCalendarExceptionPage([]);
    recordCalendarListQueries(() => HttpResponse.json(served));
    const writes = recordCalendarWrites(() => {
      served = buildCalendarExceptionPage([HOLIDAY_EXCEPTION]);
      return HttpResponse.json(HOLIDAY_EXCEPTION);
    });
    const { user } = await openCalendarExceptionsPage(FUTURE_RANGE_PATH);
    await screen.findByText('No calendar exceptions from 2026-11-16 to 2026-12-31.');

    await user.click(screen.getByRole('button', { name: 'Add exception' }));
    const dialog = getDialog(ADD_DIALOG_TITLE);
    fireEvent.change(within(dialog).getByLabelText('Date'), { target: { value: '2026-11-20' } });
    await user.click(within(dialog).getByRole('radio', { name: 'Holiday' }));
    await user.type(within(dialog).getByLabelText('Description (optional)'), 'Company holiday');
    await user.click(within(dialog).getByRole('button', { name: 'Add exception' }));

    expect(await screen.findByText(SAVE_SUCCESS_MESSAGE)).toBeInTheDocument();
    expect(writes).toEqual([
      {
        method: 'PUT',
        path: '/api/v1/work-calendar-dates/2026-11-20',
        body: { isWorkingDay: false, description: 'Company holiday' },
      },
    ]);
    expect(await screen.findByText('Company holiday')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: ADD_DIALOG_TITLE })).not.toBeInTheDocument();
  });

  it('should block a date that is today in WIB on the client and send nothing', async () => {
    recordCalendarListQueries(() => HttpResponse.json(buildCalendarExceptionPage([])));
    const writes = recordCalendarWrites(() => HttpResponse.json(HOLIDAY_EXCEPTION));
    const { user } = await openCalendarExceptionsPage(FUTURE_RANGE_PATH);
    await screen.findByText('No calendar exceptions from 2026-11-16 to 2026-12-31.');

    await user.click(screen.getByRole('button', { name: 'Add exception' }));
    const dialog = getDialog(ADD_DIALOG_TITLE);
    expect(within(dialog).getByLabelText('Date')).toHaveAttribute('min', '2026-11-16');
    fireEvent.change(within(dialog).getByLabelText('Date'), { target: { value: '2026-11-15' } });
    await user.click(within(dialog).getByRole('radio', { name: 'Holiday' }));
    await user.click(within(dialog).getByRole('button', { name: 'Add exception' }));

    expect(await within(dialog).findByText(DATE_TOO_EARLY_MESSAGE)).toBeInTheDocument();
    expect(writes).toHaveLength(0);
  });

  it('should show a 409 conflict in the dialog and refetch the list', async () => {
    const listQueries = recordCalendarListQueries(() =>
      HttpResponse.json(buildCalendarExceptionPage([])),
    );
    const writes = recordCalendarWrites(() =>
      answerWithStatus(
        409,
        'WORK_CALENDAR_DATE_NOT_FUTURE',
        'Calendar dates can only be changed for dates after today in the business timezone.',
      ),
    );
    const { user } = await openCalendarExceptionsPage(FUTURE_RANGE_PATH);
    await screen.findByText('No calendar exceptions from 2026-11-16 to 2026-12-31.');
    const listRequestsBefore = listQueries.length;

    await user.click(screen.getByRole('button', { name: 'Add exception' }));
    const dialog = getDialog(ADD_DIALOG_TITLE);
    fireEvent.change(within(dialog).getByLabelText('Date'), { target: { value: '2026-11-20' } });
    await user.click(within(dialog).getByRole('radio', { name: 'Holiday' }));
    await user.click(within(dialog).getByRole('button', { name: 'Add exception' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Calendar dates can only be changed for dates after today in the business timezone.',
    );
    expect(writes).toHaveLength(1);
    await waitFor(() => expect(listQueries.length).toBeGreaterThan(listRequestsBefore));
    expect(screen.getByRole('dialog', { name: ADD_DIALOG_TITLE })).toBeInTheDocument();
  });
});

describe('editing a calendar exception', () => {
  it('should save the changed type and description of a future exception', async () => {
    let served = buildCalendarExceptionPage([HOLIDAY_EXCEPTION, SPECIAL_WORKING_DAY_EXCEPTION]);
    recordCalendarListQueries(() => HttpResponse.json(served));
    const writes = recordCalendarWrites(() => {
      served = buildCalendarExceptionPage([
        { ...HOLIDAY_EXCEPTION, isWorkingDay: true, description: 'Office holiday' },
        SPECIAL_WORKING_DAY_EXCEPTION,
      ]);
      return HttpResponse.json({
        ...HOLIDAY_EXCEPTION,
        isWorkingDay: true,
        description: 'Office holiday',
      });
    });
    const { user } = await openCalendarExceptionsPage(FUTURE_RANGE_PATH);
    await screen.findByText('Company holiday');

    await user.click(screen.getByRole('button', { name: 'Edit exception 2026-11-20' }));
    const dialog = getDialog(EDIT_DIALOG_TITLE);
    expect(within(dialog).getByLabelText('Date')).toHaveValue('2026-11-20');
    expect(within(dialog).getByLabelText('Date')).toHaveAttribute('readonly');
    expect(within(dialog).getByRole('radio', { name: 'Holiday' })).toBeChecked();
    expect(within(dialog).getByLabelText('Description (optional)')).toHaveValue('Company holiday');

    await user.click(within(dialog).getByRole('radio', { name: 'Special working day' }));
    await user.clear(within(dialog).getByLabelText('Description (optional)'));
    await user.type(within(dialog).getByLabelText('Description (optional)'), 'Office holiday');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText(SAVE_SUCCESS_MESSAGE)).toBeInTheDocument();
    expect(writes).toEqual([
      {
        method: 'PUT',
        path: '/api/v1/work-calendar-dates/2026-11-20',
        body: { isWorkingDay: true, description: 'Office holiday' },
      },
    ]);
  });

  it('should keep what HR typed when a background refetch of the list runs', async () => {
    recordCalendarListQueries(() =>
      HttpResponse.json(buildCalendarExceptionPage([HOLIDAY_EXCEPTION])),
    );
    const queryClient = new QueryClient();
    const { user } = await openCalendarExceptionsPage(FUTURE_RANGE_PATH, queryClient);
    await screen.findByText('Company holiday');

    await user.click(screen.getByRole('button', { name: 'Edit exception 2026-11-20' }));
    const dialog = getDialog(EDIT_DIALOG_TITLE);
    const description = within(dialog).getByLabelText('Description (optional)');
    await user.clear(description);
    await user.type(description, 'Half-typed text');

    await queryClient.refetchQueries({ queryKey: ['schedule', 'calendar-exceptions'] });

    expect(getDialog(EDIT_DIALOG_TITLE)).toBeInTheDocument();
    expect(
      within(getDialog(EDIT_DIALOG_TITLE)).getByLabelText('Description (optional)'),
    ).toHaveValue('Half-typed text');
  });
});

describe('removing a calendar exception', () => {
  it('should remove a future exception only after HR confirms', async () => {
    let served = buildCalendarExceptionPage([HOLIDAY_EXCEPTION]);
    recordCalendarListQueries(() => HttpResponse.json(served));
    const writes = recordCalendarWrites(() => {
      served = buildCalendarExceptionPage([]);
      return new Response(null, { status: 204 });
    });
    const { user } = await openCalendarExceptionsPage(FUTURE_RANGE_PATH);
    await screen.findByText('Company holiday');

    await user.click(screen.getByRole('button', { name: 'Remove exception 2026-11-20' }));
    const dialog = getDialog(REMOVE_DIALOG_TITLE);
    expect(
      within(dialog).getByText('2026-11-20 will follow the regular schedule again.'),
    ).toBeInTheDocument();
    expect(writes).toHaveLength(0);

    await user.click(within(dialog).getByRole('button', { name: 'Remove exception' }));

    expect(await screen.findByText(REMOVE_SUCCESS_MESSAGE)).toBeInTheDocument();
    expect(writes).toEqual([{ method: 'DELETE', path: '/api/v1/work-calendar-dates/2026-11-20' }]);
  });

  it('should send nothing when HR cancels the removal', async () => {
    recordCalendarListQueries(() =>
      HttpResponse.json(buildCalendarExceptionPage([HOLIDAY_EXCEPTION])),
    );
    const writes = recordCalendarWrites(() => new Response(null, { status: 204 }));
    const { user } = await openCalendarExceptionsPage(FUTURE_RANGE_PATH);
    await screen.findByText('Company holiday');

    await user.click(screen.getByRole('button', { name: 'Remove exception 2026-11-20' }));
    await user.click(
      within(getDialog(REMOVE_DIALOG_TITLE)).getByRole('button', { name: 'Cancel' }),
    );

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(writes).toHaveLength(0);
    expect(getRowFor('2026-11-20')).toHaveTextContent('Company holiday');
  });
});

describe('past and current dates', () => {
  it('should show no action controls on a past or today row, and edit controls on a future row', async () => {
    recordCalendarListQueries(() =>
      HttpResponse.json(
        buildCalendarExceptionPage([PAST_EXCEPTION, TODAY_EXCEPTION, HOLIDAY_EXCEPTION]),
      ),
    );
    await openCalendarExceptionsPage(NOVEMBER_RANGE_PATH);
    await screen.findByText('Recorded holiday');

    expect(within(getRowFor('2026-11-02')).queryAllByRole('button')).toHaveLength(0);
    expect(within(getRowFor('2026-11-15')).queryAllByRole('button')).toHaveLength(0);
    expect(
      within(getRowFor('2026-11-20')).getByRole('button', { name: 'Edit exception 2026-11-20' }),
    ).toBeInTheDocument();
    expect(
      within(getRowFor('2026-11-20')).getByRole('button', { name: 'Remove exception 2026-11-20' }),
    ).toBeInTheDocument();
  });
});
