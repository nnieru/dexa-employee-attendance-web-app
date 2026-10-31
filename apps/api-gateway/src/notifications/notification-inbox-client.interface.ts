import type { AuthenticatedUser } from '@dexa/common';
import type {
  Notification,
  NotificationListQuery,
  NotificationPage,
  NotificationUnreadCount,
} from '@dexa/contracts';

/** The gateway's calls into the HR inbox of notification-service. Controllers depend on this port, not on the transport. */
export interface INotificationInboxClient {
  listNotifications(
    user: AuthenticatedUser,
    query: NotificationListQuery,
  ): Promise<NotificationPage>;
  countUnread(user: AuthenticatedUser): Promise<NotificationUnreadCount>;
  markRead(user: AuthenticatedUser, notificationId: string): Promise<Notification>;
}

export const NOTIFICATION_INBOX_CLIENT = Symbol('INotificationInboxClient');
