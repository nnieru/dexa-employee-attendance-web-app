import { notificationSchema, type Notification } from '@dexa/contracts';
import { parseResponse } from '@dexa/api-client';
import type { ApiClient } from '@dexa/session';

const NOTIFICATIONS_PATH = '/notifications';

/** Marks one of the signed-in HR user's notifications read. Repeating it is safe; the server keeps the first read time. */
export async function markNotificationRead(
  apiClient: ApiClient,
  notificationId: string,
): Promise<Notification> {
  const response = await apiClient.post<unknown>(
    `${NOTIFICATIONS_PATH}/${encodeURIComponent(notificationId)}/read`,
  );
  return parseResponse(notificationSchema, response.data);
}
