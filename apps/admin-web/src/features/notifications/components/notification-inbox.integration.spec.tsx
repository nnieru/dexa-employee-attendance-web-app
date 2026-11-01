import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  HR_ACCOUNT,
  accountCheckSucceeds,
  loginSucceeds,
  renderAdminApp,
  signInWith,
} from '../../../test/admin-app-harness.js';
import { mswServer, NOTIFICATION_UNREAD_COUNT_URL } from '../../../test/msw-server.js';
import {
  NOTIFICATION_INBOX_URL,
  READ_NOTIFICATION,
  UNREAD_NOTIFICATION,
  buildNotificationPage,
  inboxRespondsWith,
  notificationReadUrl,
} from '../../../test/notification-inbox-fixtures.js';
import { employeeListSucceeds } from '../../../test/employee-list-fixtures.js';
import {
  NOTIFICATION_LOAD_ERROR_MESSAGE,
  NOTIFICATION_MARK_READ_ERROR_MESSAGE,
  NO_NOTIFICATIONS_MESSAGE,
  NO_NOTIFICATIONS_ON_PAGE_MESSAGE,
  LOADING_NOTIFICATIONS_MESSAGE,
} from '../utils/notification-inbox-messages.js';

const SECOND_PAGE_CURSOR = 'cursor-for-page-2';
const OLDER_NOTIFICATION = { ...READ_NOTIFICATION, id: '0e1d2c3b-4a59-4687-8f9a-b0c1d2e3f4a5' };

function queryAsObject(query: URLSearchParams): Record<string, string> {
  return Object.fromEntries(query.entries());
}

function lastItem<T>(requests: ReadonlyArray<T>): T {
  const request = requests.at(-1);
  if (request === undefined) throw new Error('No request was made.');
  return request;
}

/** The navigation link to Notifications. The app renders the navigation twice, so the first (the rail) is used. */
function getNotificationsLink(accessibleName: string): HTMLElement {
  const [navigation] = screen.getAllByRole('navigation', { name: 'Main' });
  if (navigation === undefined) throw new Error('The HR navigation was not rendered.');
  return within(navigation).getByRole('link', { name: accessibleName });
}

// The badge arrives with its own request, so the link is awaited under its expected name.
function findNotificationsLink(accessibleName: string): Promise<HTMLElement> {
  return waitFor(() => getNotificationsLink(accessibleName));
}

function getItemByTitle(title: string): HTMLElement {
  const item = screen.getByText(title).closest('li');
  if (item === null) throw new Error(`No list entry holds "${title}".`);
  return item;
}

// Signs in and lands on `path`, so the first inbox request is driven by the URL the page opened with.
async function openNotificationsPage(path: string) {
  const user = userEvent.setup();
  const router = await renderAdminApp(`/login?redirect=${encodeURIComponent(path)}`);
  await signInWith(user, HR_ACCOUNT.email);
  await screen.findByRole('heading', { level: 1, name: 'Notifications' });
  return { user, router };
}

beforeEach(() => {
  mswServer.use(
    loginSucceeds(),
    accountCheckSucceeds(),
    employeeListSucceeds(),
    inboxRespondsWith(buildNotificationPage({ items: [UNREAD_NOTIFICATION, READ_NOTIFICATION] })),
  );
});

describe('notification list', () => {
  it('should show the read and unread entries with a status in text and a bolder unread title', async () => {
    await openNotificationsPage('/notifications');

    const unreadItem = getItemByTitle(UNREAD_NOTIFICATION.title);
    expect(within(unreadItem).getByText('Unread')).toBeInTheDocument();
    expect(screen.getByText(UNREAD_NOTIFICATION.title)).toHaveClass(
      'notification-item__title--unread',
    );

    const readItem = getItemByTitle(READ_NOTIFICATION.title);
    expect(within(readItem).getByText('Read')).toBeInTheDocument();
    expect(screen.getByText(READ_NOTIFICATION.title)).not.toHaveClass(
      'notification-item__title--unread',
    );
  });

  it('should offer Mark as read only on the unread entry', async () => {
    await openNotificationsPage('/notifications');

    const unreadItem = getItemByTitle(UNREAD_NOTIFICATION.title);
    expect(
      within(unreadItem).getByRole('button', {
        name: `Mark as read: ${UNREAD_NOTIFICATION.title}`,
      }),
    ).toBeEnabled();
    expect(within(getItemByTitle(READ_NOTIFICATION.title)).queryByRole('button')).toBeNull();
  });

  it('should request the first page with the default limit and no cursor', async () => {
    const requestQueries: Array<URLSearchParams> = [];
    mswServer.use(
      http.get(NOTIFICATION_INBOX_URL, ({ request }) => {
        requestQueries.push(new URL(request.url).searchParams);
        return HttpResponse.json(buildNotificationPage({ items: [UNREAD_NOTIFICATION] }));
      }),
    );
    await openNotificationsPage('/notifications');
    await screen.findByText(UNREAD_NOTIFICATION.title);

    expect(queryAsObject(lastItem(requestQueries))).toEqual({ limit: '20' });
    expect(screen.getByText('Page 1')).toBeInTheDocument();
  });

  it('should show the empty message when the inbox has no entries', async () => {
    mswServer.use(inboxRespondsWith(buildNotificationPage({ items: [] })));
    await openNotificationsPage('/notifications');

    expect(await screen.findByText(NO_NOTIFICATIONS_MESSAGE)).toBeInTheDocument();
  });

  it('should say the first page is loading while the request is pending', async () => {
    let releaseRequest: () => void = () => undefined;
    const isReleased = new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });
    mswServer.use(
      http.get(NOTIFICATION_INBOX_URL, async () => {
        await isReleased;
        return HttpResponse.json(buildNotificationPage({ items: [UNREAD_NOTIFICATION] }));
      }),
    );
    const user = userEvent.setup();
    await renderAdminApp('/login?redirect=%2Fnotifications');
    await signInWith(user, HR_ACCOUNT.email);

    expect(await screen.findByText(LOADING_NOTIFICATIONS_MESSAGE)).toBeInTheDocument();
    releaseRequest();
    expect(await screen.findByText(UNREAD_NOTIFICATION.title)).toBeInTheDocument();
  });

  it('should show the error with Try again and load the list when the user retries', async () => {
    let requestCount = 0;
    mswServer.use(
      http.get(NOTIFICATION_INBOX_URL, () => {
        requestCount += 1;
        if (requestCount === 1) {
          return HttpResponse.json(
            { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Internal error.' },
            { status: 500 },
          );
        }
        return HttpResponse.json(buildNotificationPage({ items: [UNREAD_NOTIFICATION] }));
      }),
    );
    const { user } = await openNotificationsPage('/notifications');

    expect(await screen.findByText(NOTIFICATION_LOAD_ERROR_MESSAGE)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText(UNREAD_NOTIFICATION.title)).toBeInTheDocument();
    expect(requestCount).toBe(2);
  });
});

describe('pagination in the URL', () => {
  it('should request the next page with its cursor and write the cursor to the URL', async () => {
    const requestQueries: Array<URLSearchParams> = [];
    mswServer.use(
      http.get(NOTIFICATION_INBOX_URL, ({ request }) => {
        const query = new URL(request.url).searchParams;
        requestQueries.push(query);
        if (query.has('cursor')) {
          return HttpResponse.json(buildNotificationPage({ items: [OLDER_NOTIFICATION] }));
        }
        return HttpResponse.json(
          buildNotificationPage({ items: [UNREAD_NOTIFICATION], nextCursor: SECOND_PAGE_CURSOR }),
        );
      }),
    );
    const { user, router } = await openNotificationsPage('/notifications');
    await screen.findByText(UNREAD_NOTIFICATION.title);

    await user.click(screen.getByRole('button', { name: 'Next page' }));

    expect(await screen.findByText(OLDER_NOTIFICATION.title)).toBeInTheDocument();
    expect(queryAsObject(lastItem(requestQueries))).toEqual({
      cursor: SECOND_PAGE_CURSOR,
      limit: '20',
    });
    expect(screen.getByText('Page 2')).toBeInTheDocument();
    expect(router.state.location.search).toEqual(
      expect.objectContaining({ cursors: [SECOND_PAGE_CURSOR] }),
    );
  });

  it('should open the page named in the URL and send its cursor', async () => {
    const requestQueries: Array<URLSearchParams> = [];
    mswServer.use(
      http.get(NOTIFICATION_INBOX_URL, ({ request }) => {
        requestQueries.push(new URL(request.url).searchParams);
        return HttpResponse.json(buildNotificationPage({ items: [OLDER_NOTIFICATION] }));
      }),
    );
    const cursorsParameter = encodeURIComponent(JSON.stringify([SECOND_PAGE_CURSOR]));
    await openNotificationsPage(`/notifications?cursors=${cursorsParameter}`);

    expect(await screen.findByText(OLDER_NOTIFICATION.title)).toBeInTheDocument();
    expect(lastItem(requestQueries).get('cursor')).toBe(SECOND_PAGE_CURSOR);
    expect(screen.getByText('Page 2')).toBeInTheDocument();
  });

  it('should go back to the first page without a cursor when Previous page is pressed', async () => {
    const requestQueries: Array<URLSearchParams> = [];
    mswServer.use(
      http.get(NOTIFICATION_INBOX_URL, ({ request }) => {
        const query = new URL(request.url).searchParams;
        requestQueries.push(query);
        return HttpResponse.json(
          query.has('cursor')
            ? buildNotificationPage({ items: [OLDER_NOTIFICATION] })
            : buildNotificationPage({
                items: [UNREAD_NOTIFICATION],
                nextCursor: SECOND_PAGE_CURSOR,
              }),
        );
      }),
    );
    const { user, router } = await openNotificationsPage('/notifications');
    await screen.findByText(UNREAD_NOTIFICATION.title);
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    await screen.findByText(OLDER_NOTIFICATION.title);

    await user.click(screen.getByRole('button', { name: 'Previous page' }));

    await screen.findByText(UNREAD_NOTIFICATION.title);
    expect(queryAsObject(lastItem(requestQueries))).toEqual({ limit: '20' });
    expect(screen.getByText('Page 1')).toBeInTheDocument();
    expect(router.state.location.search.cursors).toBeUndefined();
  });

  it('should disable Next page when the server reports no further page', async () => {
    await openNotificationsPage('/notifications');
    await screen.findByText(UNREAD_NOTIFICATION.title);

    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
  });

  it('should show the on-this-page message on a later page with no entries', async () => {
    mswServer.use(inboxRespondsWith(buildNotificationPage({ items: [] })));
    await openNotificationsPage(
      `/notifications?cursors=${encodeURIComponent(JSON.stringify([SECOND_PAGE_CURSOR]))}`,
    );

    expect(await screen.findByText(NO_NOTIFICATIONS_ON_PAGE_MESSAGE)).toBeInTheDocument();
  });
});

describe('mark as read', () => {
  it('should send the mark-read request, show the entry as read, and update the unread count', async () => {
    let unreadCount = 1;
    const readRequestUrls: Array<string> = [];
    mswServer.use(
      http.get(NOTIFICATION_UNREAD_COUNT_URL, () => HttpResponse.json({ unreadCount })),
      http.post(`/api/v1/notifications/:id/read`, ({ request }) => {
        readRequestUrls.push(new URL(request.url).pathname);
        unreadCount = 0;
        return HttpResponse.json({
          ...UNREAD_NOTIFICATION,
          readAt: '2026-11-13T03:00:00.000Z',
        });
      }),
    );
    const { user } = await openNotificationsPage('/notifications');
    await findNotificationsLink('Notifications, 1 unread');

    await user.click(
      within(getItemByTitle(UNREAD_NOTIFICATION.title)).getByRole('button', {
        name: `Mark as read: ${UNREAD_NOTIFICATION.title}`,
      }),
    );

    await waitFor(() =>
      expect(
        within(getItemByTitle(UNREAD_NOTIFICATION.title)).getByText('Read'),
      ).toBeInTheDocument(),
    );
    expect(readRequestUrls).toEqual([notificationReadUrl(UNREAD_NOTIFICATION.id)]);
    expect(within(getItemByTitle(UNREAD_NOTIFICATION.title)).queryByRole('button')).toBeNull();
    await findNotificationsLink('Notifications');
  });

  it('should disable the mark-read button while the request is pending and keep its label', async () => {
    let releaseRequest: () => void = () => undefined;
    const isReleased = new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });
    mswServer.use(
      http.post(`/api/v1/notifications/:id/read`, async () => {
        await isReleased;
        return HttpResponse.json({ ...UNREAD_NOTIFICATION, readAt: '2026-11-13T03:00:00.000Z' });
      }),
    );
    const { user } = await openNotificationsPage('/notifications');
    const markButton = within(getItemByTitle(UNREAD_NOTIFICATION.title)).getByRole('button', {
      name: `Mark as read: ${UNREAD_NOTIFICATION.title}`,
    });

    await user.click(markButton);

    expect(markButton).toBeDisabled();
    expect(markButton).toHaveAttribute('aria-busy', 'true');
    expect(markButton).toHaveTextContent('Mark as read');
    releaseRequest();
    await waitFor(() => expect(markButton).not.toBeInTheDocument());
  });

  it('should show the mark-read error and keep the entry unread when the request fails', async () => {
    mswServer.use(
      http.post(`/api/v1/notifications/:id/read`, () =>
        HttpResponse.json(
          { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Internal error.' },
          { status: 500 },
        ),
      ),
    );
    const { user } = await openNotificationsPage('/notifications');
    const markButton = within(getItemByTitle(UNREAD_NOTIFICATION.title)).getByRole('button', {
      name: `Mark as read: ${UNREAD_NOTIFICATION.title}`,
    });

    await user.click(markButton);

    expect(await screen.findByText(NOTIFICATION_MARK_READ_ERROR_MESSAGE)).toBeInTheDocument();
    expect(
      within(getItemByTitle(UNREAD_NOTIFICATION.title)).getByText('Unread'),
    ).toBeInTheDocument();
    expect(markButton).toBeEnabled();
  });
});

describe('unread count in the navigation', () => {
  it('should show the unread count beside Notifications in the navigation', async () => {
    mswServer.use(
      http.get(NOTIFICATION_UNREAD_COUNT_URL, () => HttpResponse.json({ unreadCount: 3 })),
    );
    await openNotificationsPage('/notifications');

    const link = await findNotificationsLink('Notifications, 3 unread');
    expect(link).toHaveTextContent('3');
  });

  it('should show no badge when nothing is unread', async () => {
    await openNotificationsPage('/notifications');

    expect(await findNotificationsLink('Notifications')).toBeInTheDocument();
  });

  it('should show no badge when the unread count cannot be loaded', async () => {
    mswServer.use(
      http.get(NOTIFICATION_UNREAD_COUNT_URL, () =>
        HttpResponse.json(
          { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Internal error.' },
          { status: 500 },
        ),
      ),
    );
    await openNotificationsPage('/notifications');
    await screen.findByText(UNREAD_NOTIFICATION.title);

    expect(getNotificationsLink('Notifications')).toBeInTheDocument();
  });
});
