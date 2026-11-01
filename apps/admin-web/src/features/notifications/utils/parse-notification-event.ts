import { notificationSchema, type Notification } from '@dexa/contracts';

/**
 * Returns the notification when the event data matches the contract, otherwise null. An invalid payload is skipped:
 * it shows no toast and refreshes nothing. Its content is not logged, because it may carry unexpected values.
 */
export function parseNotificationEvent(rawData: string): Notification | null {
  let payload: unknown;
  try {
    payload = JSON.parse(rawData);
  } catch {
    return null;
  }
  const result = notificationSchema.safeParse(payload);
  return result.success ? result.data : null;
}
