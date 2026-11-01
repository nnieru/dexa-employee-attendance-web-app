import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mswServer } from '../../../test/msw-server.js';
import { accountCheckSucceeds, loginSucceeds } from '../../../test/admin-app-harness.js';
import {
  CREATED_VERSION,
  CURRENT_VERSION,
  CURRENT_VERSION_ENDING,
  UPCOMING_VERSION,
  WORK_SCHEDULES_URL,
  buildWorkScheduleOverview,
} from '../../../test/work-schedule-fixtures.js';
import {
  answerWithVersion,
  openWorkSchedulePage,
  recordWorkScheduleSaves,
} from '../../../test/work-schedule-test-helpers.js';
import {
  CONFLICT_MESSAGE,
  NO_SCHEDULE_TITLE,
  RETRY_LABEL,
  WORK_SCHEDULE_LOADING_TEXT,
  WORK_SCHEDULE_LOAD_ERROR_MESSAGE,
  WORK_SCHEDULE_SAVED_MESSAGE,
} from '../utils/work-schedule-messages.js';

// 20:00 UTC on 14 November is 03:00 WIB on 15 November: today in WIB is 15 November, tomorrow is 16 November.
const NOW_IN_WIB_TODAY_15_NOVEMBER = new Date('2026-11-14T20:00:00.000Z');
const SAVE_DIALOG_NAME = 'Save work schedule?';
const WEEKDAY_ERROR_MESSAGE = 'Select at least one working day.';
const PAST_DATE_MESSAGE = 'Choose tomorrow or a later date (WIB).';

function setServedOverview(overview: ReturnType<typeof buildWorkScheduleOverview>) {
  mswServer.use(http.get(WORK_SCHEDULES_URL, () => HttpResponse.json(overview)));
}

function getUpcomingRegion(): HTMLElement {
  return screen.getByRole('region', { name: 'Upcoming version' });
}

async function confirmSave(user: ReturnType<typeof userEvent.setup>) {
  const dialog = await screen.findByRole('dialog', { name: SAVE_DIALOG_NAME });
  await user.click(within(dialog).getByRole('button', { name: 'Save schedule' }));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW_IN_WIB_TODAY_15_NOVEMBER);
  mswServer.use(loginSucceeds(), accountCheckSucceeds());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('work schedule overview', () => {
  it('should show the version in effect and the upcoming version with their dates and times', async () => {
    setServedOverview(
      buildWorkScheduleOverview({ current: CURRENT_VERSION_ENDING, upcoming: UPCOMING_VERSION }),
    );
    await openWorkSchedulePage();

    const current = await screen.findByRole('region', { name: 'Current schedule' });
    expect(within(current).getByText('In effect')).toBeInTheDocument();
    expect(within(current).getByText('Mon, Tue, Wed, Thu, Fri')).toBeInTheDocument();
    expect(within(current).getByText('09:00')).toBeInTheDocument();
    expect(within(current).getByText('18:00')).toBeInTheDocument();
    expect(within(current).getByText('15 minutes')).toBeInTheDocument();
    expect(within(current).getByText('2026-10-01')).toBeInTheDocument();
    expect(within(current).getByText('2026-12-01')).toBeInTheDocument();

    const upcoming = getUpcomingRegion();
    expect(within(upcoming).getByText('Starts 2026-12-01')).toBeInTheDocument();
    expect(within(upcoming).getByText('08:30')).toBeInTheDocument();
    expect(within(upcoming).getByText('Open-ended')).toBeInTheDocument();
  });

  it('should show the version in effect without any edit control', async () => {
    setServedOverview(
      buildWorkScheduleOverview({ current: CURRENT_VERSION_ENDING, upcoming: UPCOMING_VERSION }),
    );
    await openWorkSchedulePage();

    const current = await screen.findByRole('region', { name: 'Current schedule' });
    expect(within(current).queryAllByRole('button')).toHaveLength(0);
    expect(within(current).queryAllByRole('textbox')).toHaveLength(0);
    expect(within(current).queryAllByRole('checkbox')).toHaveLength(0);
    expect(within(current).queryAllByRole('spinbutton')).toHaveLength(0);
    expect(within(current).queryAllByRole('combobox')).toHaveLength(0);
  });

  it('should show the empty state and the new version form when no version is configured', async () => {
    setServedOverview(buildWorkScheduleOverview({}));
    await openWorkSchedulePage();

    expect(await screen.findByText(NO_SCHEDULE_TITLE)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'New version' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save new version' })).toBeEnabled();
  });

  it('should show the loading state while the schedule loads', async () => {
    let releaseOverview: () => void = () => undefined;
    const overviewReleased = new Promise<void>((resolve) => {
      releaseOverview = resolve;
    });
    mswServer.use(
      http.get(WORK_SCHEDULES_URL, async () => {
        await overviewReleased;
        return HttpResponse.json(buildWorkScheduleOverview({ current: CURRENT_VERSION }));
      }),
    );
    await openWorkSchedulePage();

    expect(screen.getByText(WORK_SCHEDULE_LOADING_TEXT)).toBeInTheDocument();
    releaseOverview();
    await screen.findByRole('region', { name: 'Current schedule' });
  });

  it('should show an error with a retry action and load the schedule when HR retries', async () => {
    let overviewAttempts = 0;
    mswServer.use(
      http.get(WORK_SCHEDULES_URL, () => {
        overviewAttempts += 1;
        if (overviewAttempts === 1) {
          return HttpResponse.json(
            {
              statusCode: 500,
              code: 'INTERNAL_ERROR',
              message: 'Something went wrong. Try again.',
            },
            { status: 500 },
          );
        }
        return HttpResponse.json(buildWorkScheduleOverview({ current: CURRENT_VERSION }));
      }),
    );
    const { user } = await openWorkSchedulePage();

    expect(await screen.findByRole('alert')).toHaveTextContent(WORK_SCHEDULE_LOAD_ERROR_MESSAGE);
    await user.click(screen.getByRole('button', { name: RETRY_LABEL }));
    await screen.findByRole('region', { name: 'Current schedule' });
    expect(overviewAttempts).toBe(2);
  });
});

describe('creating a version', () => {
  it('should create a new upcoming version after HR confirms, without sending a timezone', async () => {
    setServedOverview(buildWorkScheduleOverview({ current: CURRENT_VERSION }));
    const saves = recordWorkScheduleSaves(() => answerWithVersion(CREATED_VERSION, 201));
    const { user } = await openWorkSchedulePage();
    await screen.findByRole('region', { name: 'Current schedule' });

    await user.click(screen.getByRole('checkbox', { name: 'Fri' }));
    fireEvent.change(screen.getByLabelText('End time (WIB)'), { target: { value: '17:30' } });
    fireEvent.change(screen.getByLabelText('Effective from (WIB)'), {
      target: { value: '2026-12-01' },
    });
    await user.click(screen.getByRole('button', { name: 'Save new version' }));

    expect(saves).toHaveLength(0);
    await confirmSave(user);

    expect(await screen.findByText(WORK_SCHEDULE_SAVED_MESSAGE)).toBeInTheDocument();
    expect(saves).toEqual([
      {
        method: 'POST',
        path: WORK_SCHEDULES_URL,
        body: {
          workingWeekdays: [1, 2, 3, 4],
          startTime: '09:00',
          endTime: '17:30',
          lateCheckinGraceMinutes: 15,
          earlyCheckoutGraceMinutes: 0,
          lateCheckoutGraceMinutes: 0,
          effectiveFrom: '2026-12-01',
        },
      },
    ]);
  });

  it('should send nothing and keep the entered values when HR cancels the confirmation', async () => {
    setServedOverview(buildWorkScheduleOverview({ current: CURRENT_VERSION }));
    const saves = recordWorkScheduleSaves(() => answerWithVersion(CREATED_VERSION, 201));
    const { user } = await openWorkSchedulePage();
    await screen.findByRole('region', { name: 'Current schedule' });

    fireEvent.change(screen.getByLabelText('Effective from (WIB)'), {
      target: { value: '2026-12-01' },
    });
    await user.click(screen.getByRole('button', { name: 'Save new version' }));
    const dialog = await screen.findByRole('dialog', { name: SAVE_DIALOG_NAME });
    expect(
      within(dialog).getByText(/Attendance already recorded is not reclassified/),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(saves).toHaveLength(0);
    expect(screen.getByLabelText('Effective from (WIB)')).toHaveValue('2026-12-01');
  });

  it('should block an effective date of today in WIB on the client and send nothing', async () => {
    setServedOverview(buildWorkScheduleOverview({ current: CURRENT_VERSION }));
    const saves = recordWorkScheduleSaves(() => answerWithVersion(CREATED_VERSION, 201));
    const { user } = await openWorkSchedulePage();
    await screen.findByRole('region', { name: 'Current schedule' });

    const effectiveFrom = screen.getByLabelText('Effective from (WIB)');
    expect(effectiveFrom).toHaveAttribute('min', '2026-11-16');
    fireEvent.change(effectiveFrom, { target: { value: '2026-11-15' } });
    await user.click(screen.getByRole('button', { name: 'Save new version' }));

    expect(await screen.findByText(PAST_DATE_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(saves).toHaveLength(0);
  });

  it('should refuse a save with no working day on the client and send nothing', async () => {
    setServedOverview(buildWorkScheduleOverview({ current: CURRENT_VERSION }));
    const saves = recordWorkScheduleSaves(() => answerWithVersion(CREATED_VERSION, 201));
    const { user } = await openWorkSchedulePage();
    await screen.findByRole('region', { name: 'Current schedule' });

    for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']) {
      await user.click(screen.getByRole('checkbox', { name: day }));
    }
    fireEvent.change(screen.getByLabelText('Effective from (WIB)'), {
      target: { value: '2026-12-01' },
    });
    await user.click(screen.getByRole('button', { name: 'Save new version' }));

    expect(await screen.findByText(WEEKDAY_ERROR_MESSAGE)).toBeInTheDocument();
    expect(saves).toHaveLength(0);
  });
});

describe('editing the upcoming version', () => {
  it('should save the upcoming version edit after HR confirms and show the saved values', async () => {
    let served = buildWorkScheduleOverview({
      current: CURRENT_VERSION_ENDING,
      upcoming: UPCOMING_VERSION,
    });
    setServedOverview(served);
    const saves = recordWorkScheduleSaves(() => {
      served = buildWorkScheduleOverview({
        current: CURRENT_VERSION_ENDING,
        upcoming: { ...UPCOMING_VERSION, startTime: '08:45' },
      });
      return answerWithVersion({ ...UPCOMING_VERSION, startTime: '08:45' });
    });
    const { user } = await openWorkSchedulePage();
    await screen.findByRole('region', { name: 'Upcoming version' });
    mswServer.use(http.get(WORK_SCHEDULES_URL, () => HttpResponse.json(served)));

    expect(
      screen.getByRole('heading', { level: 2, name: 'Edit upcoming version' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Start time (WIB)')).toHaveValue('08:30');
    fireEvent.change(screen.getByLabelText('Start time (WIB)'), { target: { value: '08:45' } });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await confirmSave(user);

    expect(await screen.findByText(WORK_SCHEDULE_SAVED_MESSAGE)).toBeInTheDocument();
    expect(saves).toEqual([
      {
        method: 'PUT',
        path: `/api/v1/work-schedules/${UPCOMING_VERSION.id}`,
        body: {
          workingWeekdays: [1, 2, 3, 4, 5],
          startTime: '08:45',
          endTime: '18:00',
          lateCheckinGraceMinutes: 15,
          earlyCheckoutGraceMinutes: 0,
          lateCheckoutGraceMinutes: 0,
          effectiveFrom: '2026-12-01',
        },
      },
    ]);
    await waitFor(() => expect(getUpcomingRegion()).toHaveTextContent('08:45'));
  });
});

describe('conflicts', () => {
  it('should show the conflict message and reload the schedule when another change saved first', async () => {
    let served = buildWorkScheduleOverview({ current: CURRENT_VERSION });
    setServedOverview(served);
    const saves = recordWorkScheduleSaves(() => {
      // Another HR user created an upcoming version first. The service answers 409 and HR's form must reload it.
      served = buildWorkScheduleOverview({
        current: CURRENT_VERSION_ENDING,
        upcoming: UPCOMING_VERSION,
      });
      return HttpResponse.json(
        {
          statusCode: 409,
          code: 'WORK_SCHEDULE_UPCOMING_EXISTS',
          message: 'An upcoming schedule already exists. Edit it instead of creating another.',
        },
        { status: 409 },
      );
    });
    mswServer.use(http.get(WORK_SCHEDULES_URL, () => HttpResponse.json(served)));
    const { user } = await openWorkSchedulePage();
    await screen.findByRole('region', { name: 'Current schedule' });

    fireEvent.change(screen.getByLabelText('Effective from (WIB)'), {
      target: { value: '2026-12-01' },
    });
    await user.click(screen.getByRole('button', { name: 'Save new version' }));
    await confirmSave(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(CONFLICT_MESSAGE);
    expect(saves).toHaveLength(1);
    await waitFor(() => expect(getUpcomingRegion()).toHaveTextContent('Starts 2026-12-01'));
    expect(
      screen.getByRole('heading', { level: 2, name: 'Edit upcoming version' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Start time (WIB)')).toHaveValue('08:30');
  });
});
