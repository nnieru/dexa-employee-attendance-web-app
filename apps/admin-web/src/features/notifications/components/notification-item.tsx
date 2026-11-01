import type { Notification } from '@dexa/contracts';
import { Button, StatusLabel } from '@dexa/ui';
import {
  MARK_AS_READ_LABEL,
  READ_STATUS_TEXT,
  UNREAD_STATUS_TEXT,
} from '../utils/notification-inbox-messages.js';
import { formatNotificationTime } from '../utils/format-notification-time.js';

type NotificationItemProps = {
  notification: Notification;
  isMarkReadPending: boolean;
  onMarkRead: (notificationId: string) => void;
};

/**
 * One inbox entry (DESIGN §7). Read state is shown as text and as the title's weight, never by color alone. Only an
 * unread entry offers the mark-read action; its busy state keeps the label and disables a second press.
 */
export function NotificationItem({
  notification,
  isMarkReadPending,
  onMarkRead,
}: NotificationItemProps) {
  const isUnread = notification.readAt === null;
  return (
    <li className="notification-item">
      <div className="notification-item__meta">
        <StatusLabel tone={isUnread ? 'info' : 'neutral'}>
          {isUnread ? UNREAD_STATUS_TEXT : READ_STATUS_TEXT}
        </StatusLabel>
        <time dateTime={notification.occurredAt}>
          {formatNotificationTime(notification.occurredAt)}
        </time>
      </div>
      <p
        className={
          isUnread
            ? 'notification-item__title notification-item__title--unread'
            : 'notification-item__title'
        }
      >
        {notification.title}
      </p>
      <p className="notification-item__body">{notification.body}</p>
      {isUnread && (
        <Button
          variant="secondary"
          isLoading={isMarkReadPending}
          aria-label={`${MARK_AS_READ_LABEL}: ${notification.title}`}
          onClick={() => onMarkRead(notification.id)}
        >
          {MARK_AS_READ_LABEL}
        </Button>
      )}
    </li>
  );
}
