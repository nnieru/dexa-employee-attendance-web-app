import {
  ServiceName,
  type AuthenticatedUser,
  type IInternalHttpClient,
  type InternalGetRequest,
  type InternalPostRequest,
} from '@dexa/common';
import {
  Role,
  type Notification,
  type NotificationPage,
  type NotificationUnreadCount,
} from '@dexa/contracts';
import { NotificationInboxClient } from './notification-inbox.client.js';

const USER: AuthenticatedUser = {
  accountId: '5f0c1f3e-8d2a-4b7e-9c61-2a4d6e8f0b13',
  role: Role.HR,
};
const NOTIFICATION_ID = '3f6a1c2e-8b9d-4e7f-a0b1-c2d3e4f5a6b7';
const NOTIFICATION: Notification = {
  id: NOTIFICATION_ID,
  eventType: 'employee.profile.updated',
  title: 'Budi Santoso updated: phone number',
  body: 'Changed fields: phone number.',
  data: { changedFields: ['phoneNumber'] },
  occurredAt: '2026-10-30T02:05:00.000Z',
  createdAt: '2026-10-30T02:05:01.000Z',
  readAt: '2026-10-31T01:00:00.000Z',
};
const PAGE: NotificationPage = { items: [NOTIFICATION], nextCursor: 'b3BhcXVlLWN1cnNvcg' };
const UNREAD: NotificationUnreadCount = { unreadCount: 4 };

type RecordedCall =
  | { readonly method: 'get'; readonly request: InternalGetRequest<unknown> }
  | { readonly method: 'post'; readonly request: InternalPostRequest<unknown> };

// Answers each verb with the given body, parsed by the schema the client passes, and records every call.
function createRecordingHttpClient(answer: unknown, calls: RecordedCall[]): IInternalHttpClient {
  return {
    get: <TResponse>(request: InternalGetRequest<TResponse>): Promise<TResponse> => {
      calls.push({ method: 'get', request });
      return Promise.resolve().then(() => request.responseSchema.parse(answer));
    },
    getBinary: () => Promise.reject(new Error('The client never fetches bytes.')),
    post: <TResponse>(request: InternalPostRequest<TResponse>): Promise<TResponse> => {
      calls.push({ method: 'post', request });
      return Promise.resolve().then(() => request.responseSchema.parse(answer));
    },
    patch: () => Promise.reject(new Error('The client never patches.')),
    putJson: () => Promise.reject(new Error('The client never puts JSON.')),
    put: () => Promise.reject(new Error('The client never puts.')),
    delete: () => Promise.reject(new Error('The client never deletes.')),
  };
}

describe('NotificationInboxClient.listNotifications', () => {
  it('should get the inbox on behalf of the user with the limit and cursor as sent', async () => {
    const calls: RecordedCall[] = [];
    const client = new NotificationInboxClient(createRecordingHttpClient(PAGE, calls));

    const page = await client.listNotifications(USER, { limit: 5, cursor: 'b3BhcXVlLWN1cnNvcg' });

    expect(page).toEqual(PAGE);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: 'get',
      request: {
        target: ServiceName.NOTIFICATION_SERVICE,
        path: '/api/v1/notifications',
        query: { limit: '5', cursor: 'b3BhcXVlLWN1cnNvcg' },
        onBehalfOf: USER,
      },
    });
  });

  it('should omit the cursor from the forwarded query when the first page is requested', async () => {
    const calls: RecordedCall[] = [];
    const client = new NotificationInboxClient(createRecordingHttpClient(PAGE, calls));

    await client.listNotifications(USER, { limit: 20 });

    expect(calls[0]?.request).toMatchObject({ query: { limit: '20' } });
    expect(calls[0]?.request).not.toHaveProperty('query.cursor');
  });

  it('should reject the answer when notification-service sends an item the contract does not define', async () => {
    const calls: RecordedCall[] = [];
    const client = new NotificationInboxClient(
      createRecordingHttpClient(
        { items: [{ ...NOTIFICATION, passwordHash: 'x' }], nextCursor: null },
        calls,
      ),
    );

    await expect(client.listNotifications(USER, { limit: 20 })).rejects.toThrow();
  });
});

describe('NotificationInboxClient.countUnread', () => {
  it('should get the unread count route on behalf of the user', async () => {
    const calls: RecordedCall[] = [];
    const client = new NotificationInboxClient(createRecordingHttpClient(UNREAD, calls));

    const count = await client.countUnread(USER);

    expect(count).toEqual(UNREAD);
    expect(calls[0]).toMatchObject({
      method: 'get',
      request: {
        target: ServiceName.NOTIFICATION_SERVICE,
        path: '/api/v1/notifications/unread-count',
        onBehalfOf: USER,
      },
    });
    expect(calls[0]?.request).not.toHaveProperty('query');
  });
});

describe('NotificationInboxClient.markRead', () => {
  it('should post to the read route on behalf of the user, once, with an empty body', async () => {
    const calls: RecordedCall[] = [];
    const client = new NotificationInboxClient(createRecordingHttpClient(NOTIFICATION, calls));

    const notification = await client.markRead(USER, NOTIFICATION_ID);

    expect(notification).toEqual(NOTIFICATION);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: 'post',
      request: {
        target: ServiceName.NOTIFICATION_SERVICE,
        path: `/api/v1/notifications/${NOTIFICATION_ID}/read`,
        body: {},
        onBehalfOf: USER,
      },
    });
  });
});
