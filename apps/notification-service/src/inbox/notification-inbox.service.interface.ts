import type {
  Notification,
  NotificationListQuery,
  NotificationPage,
  NotificationUnreadCount,
} from '@dexa/contracts';

/**
 * The HR inbox use cases. Every method takes the recipient from the verified token, never from the request, so one
 * HR account cannot read or change another account's rows.
 */
export interface INotificationInboxService {
  listNotifications(
    recipientAccountId: string,
    query: NotificationListQuery,
  ): Promise<NotificationPage>;
  countUnread(recipientAccountId: string): Promise<NotificationUnreadCount>;
  markRead(recipientAccountId: string, notificationId: string): Promise<Notification>;
}

export const NOTIFICATION_INBOX_SERVICE = Symbol('INotificationInboxService');
