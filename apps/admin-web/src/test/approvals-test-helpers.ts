import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { mswServer } from './msw-server.js';
import { HR_ACCOUNT, renderAdminApp, signInWith } from './admin-app-harness.js';

/** Signs in and lands on `path` (the queue or a detail link), so the URL drives the first request. */
export async function openApprovalsPage(path: string) {
  const user = userEvent.setup();
  const router = await renderAdminApp(`/login?redirect=${encodeURIComponent(path)}`);
  await signInWith(user, HR_ACCOUNT.email);
  await screen.findByRole('heading', { level: 1, name: 'Approvals' });
  return { user, router };
}

export async function openNotificationsPage(path: string) {
  const user = userEvent.setup();
  const router = await renderAdminApp(`/login?redirect=${encodeURIComponent(path)}`);
  await signInWith(user, HR_ACCOUNT.email);
  await screen.findByRole('heading', { level: 1, name: 'Notifications' });
  return { user, router };
}

/**
 * Records the query of every review-queue request at `queueUrl`, and answers each with the response `respond` returns.
 * The queue URL is exact (base without an ID or a decision verb), so one recorder follows one list endpoint.
 */
export function recordApprovalQueueRequests(
  queueUrl: string,
  respond: () => Response,
): Array<URLSearchParams> {
  const requestQueries: Array<URLSearchParams> = [];
  mswServer.use(
    http.get(queueUrl, ({ request }) => {
      const query = new URL(request.url).searchParams;
      requestQueries.push(query);
      return respond();
    }),
  );
  return requestQueries;
}

/** Records the body of every POST at `decisionUrl`, and answers each with the response `respond` returns. */
export function recordDecisions(
  decisionUrl: string,
  respond: (body: unknown) => Response,
): Array<unknown> {
  const postedBodies: Array<unknown> = [];
  mswServer.use(
    http.post(decisionUrl, async ({ request }) => {
      const body: unknown = await request.json();
      postedBodies.push(body);
      return respond(body);
    }),
  );
  return postedBodies;
}
