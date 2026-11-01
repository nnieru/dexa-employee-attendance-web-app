import { notificationUnreadCountSchema, type NotificationUnreadCount } from '@dexa/contracts';
import { parseResponse } from '@dexa/api-client';
import type { ApiClient } from '@dexa/session';

const UNREAD_COUNT_PATH = '/notifications/unread-count';

export async function fetchUnreadNotificationCount(
  apiClient: ApiClient,
): Promise<NotificationUnreadCount> {
  const response = await apiClient.get<unknown>(UNREAD_COUNT_PATH);
  return parseResponse(notificationUnreadCountSchema, response.data);
}
