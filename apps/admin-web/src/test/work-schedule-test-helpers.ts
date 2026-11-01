import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import type { WorkScheduleVersion } from '@dexa/contracts';
import { mswServer } from './msw-server.js';
import { HR_ACCOUNT, renderAdminApp, signInWith } from './admin-app-harness.js';
import { WORK_SCHEDULES_URL, WORK_SCHEDULE_VERSION_URL } from './work-schedule-fixtures.js';

export type RecordedWorkScheduleSave = {
  method: 'POST' | 'PUT';
  path: string;
  /** The JSON body as sent. Tests compare it with toEqual, so an extra field (such as a timezone) fails. */
  body: unknown;
};

/**
 * Records every create (POST) and edit (PUT) request. `respond` gets the 1-based attempt number, so a test can fail one
 * attempt and answer the next.
 */
export function recordWorkScheduleSaves(
  respond: (save: RecordedWorkScheduleSave, attempt: number) => Response | Promise<Response>,
): Array<RecordedWorkScheduleSave> {
  const saves: Array<RecordedWorkScheduleSave> = [];
  const record = async (
    method: RecordedWorkScheduleSave['method'],
    path: string,
    body: unknown,
  ): Promise<Response> => {
    const save: RecordedWorkScheduleSave = { method, path, body };
    saves.push(save);
    return respond(save, saves.length);
  };
  mswServer.use(
    http.post(WORK_SCHEDULES_URL, async ({ request }) =>
      record('POST', new URL(request.url).pathname, await request.json()),
    ),
    http.put(WORK_SCHEDULE_VERSION_URL, async ({ request }) =>
      record('PUT', new URL(request.url).pathname, await request.json()),
    ),
  );
  return saves;
}

/** A successful save answer: 201 for a create, 200 for an edit. */
export function answerWithVersion(version: WorkScheduleVersion, status: 200 | 201 = 200): Response {
  return HttpResponse.json(version, { status });
}

/** Signs in and opens the schedule screen. The heading shows before the schedule loads, so tests wait for their own content. */
export async function openWorkSchedulePage() {
  const user = userEvent.setup();
  const router = await renderAdminApp(`/login?redirect=${encodeURIComponent('/schedule')}`);
  await signInWith(user, HR_ACCOUNT.email);
  await screen.findByRole('heading', { level: 1, name: 'Work schedule' });
  return { user, router };
}
