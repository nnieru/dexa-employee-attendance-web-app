import {
  INTERNAL_HTTP_CLIENT,
  ServiceName,
  type AuthenticatedUser,
  type IInternalHttpClient,
} from '@dexa/common';
import {
  API_PREFIX,
  notificationPageSchema,
  notificationSchema,
  notificationUnreadCountSchema,
  type Notification,
  type NotificationListQuery,
  type NotificationPage,
  type NotificationUnreadCount,
} from '@dexa/contracts';
import { Inject, Injectable } from '@nestjs/common';
import type { INotificationInboxClient } from './notification-inbox-client.interface.js';

const INBOX_PATH = `/${API_PREFIX}/notifications`;
const UNREAD_COUNT_PATH = `/${API_PREFIX}/notifications/unread-count`;

@Injectable()
export class NotificationInboxClient implements INotificationInboxClient {
  constructor(@Inject(INTERNAL_HTTP_CLIENT) private readonly httpClient: IInternalHttpClient) {}

  // A read, so the gateway may retry it. The cursor and limit are forwarded as the caller sent them, and an absent
  // cursor is omitted so notification-service starts from the newest row.
  listNotifications(
    user: AuthenticatedUser,
    query: NotificationListQuery,
  ): Promise<NotificationPage> {
    return this.httpClient.get({
      target: ServiceName.NOTIFICATION_SERVICE,
      path: INBOX_PATH,
      query: toListQueryParameters(query),
      onBehalfOf: user,
      responseSchema: notificationPageSchema,
    });
  }

  // A read, so the gateway may retry it.
  countUnread(user: AuthenticatedUser): Promise<NotificationUnreadCount> {
    return this.httpClient.get({
      target: ServiceName.NOTIFICATION_SERVICE,
      path: UNREAD_COUNT_PATH,
      onBehalfOf: user,
      responseSchema: notificationUnreadCountSchema,
    });
  }

  // A write, so it is never retried: a lost answer may hide a row that was marked, and a retry would only repeat
  // the same answer. The body is sent as an empty object, because the route takes no body.
  markRead(user: AuthenticatedUser, notificationId: string): Promise<Notification> {
    return this.httpClient.post({
      target: ServiceName.NOTIFICATION_SERVICE,
      path: `${INBOX_PATH}/${encodeURIComponent(notificationId)}/read`,
      body: {},
      onBehalfOf: user,
      responseSchema: notificationSchema,
    });
  }
}

function toListQueryParameters(query: NotificationListQuery): Record<string, string> {
  const parameters: Record<string, string> = { limit: String(query.limit) };
  if (query.cursor !== undefined) parameters.cursor = query.cursor;
  return parameters;
}
