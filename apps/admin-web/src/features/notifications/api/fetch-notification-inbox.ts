import {
  notificationPageSchema,
  type NotificationListQuery,
  type NotificationPage,
} from '@dexa/contracts';
import { parseResponse } from '@dexa/api-client';
import type { ApiClient } from '@dexa/session';

const NOTIFICATION_INBOX_PATH = '/notifications';

/** One page of the HR inbox, newest first. The cursor is opaque; the page number is kept by the caller. */
export async function fetchNotificationInbox(
  apiClient: ApiClient,
  query: NotificationListQuery,
): Promise<NotificationPage> {
  const response = await apiClient.get<unknown>(NOTIFICATION_INBOX_PATH, { params: query });
  return parseResponse(notificationPageSchema, response.data);
}
