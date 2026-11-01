import type { Notification } from '@dexa/contracts';
import { Alert, Button } from '@dexa/ui';
import { NotificationItem } from './notification-item.js';
import {
  LOADING_NOTIFICATIONS_MESSAGE,
  NOTIFICATION_LIST_LABEL,
  NOTIFICATION_LOAD_ERROR_MESSAGE,
  NO_NOTIFICATIONS_MESSAGE,
  NO_NOTIFICATIONS_ON_PAGE_MESSAGE,
  REFRESHING_NOTIFICATIONS_MESSAGE,
} from '../utils/notification-inbox-messages.js';

type NotificationListProps = {
  items: ReadonlyArray<Notification>;
  isFirstPage: boolean;
  isPending: boolean;
  isFetching: boolean;
  hasError: boolean;
  markReadPendingId: string | undefined;
  onMarkRead: (notificationId: string) => void;
  onRetry: () => void;
};

/**
 * The inbox body in exactly one state: an error (which wins over stale rows, so a failed reload is never hidden),
 * the first load, the rows with a refreshing note, or an empty message.
 */
export function NotificationList({
  items,
  isFirstPage,
  isPending,
  isFetching,
  hasError,
  markReadPendingId,
  onMarkRead,
  onRetry,
}: NotificationListProps) {
  if (hasError) {
    return (
      <Alert
        variant="error"
        action={
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        }
      >
        {NOTIFICATION_LOAD_ERROR_MESSAGE}
      </Alert>
    );
  }
  if (isPending) {
    return (
      <p role="status" className="notification-list__state">
        {LOADING_NOTIFICATIONS_MESSAGE}
      </p>
    );
  }
  if (items.length === 0) {
    return (
      <p className="notification-list__state">
        {isFirstPage ? NO_NOTIFICATIONS_MESSAGE : NO_NOTIFICATIONS_ON_PAGE_MESSAGE}
      </p>
    );
  }
  return (
    <>
      {isFetching && (
        <p role="status" className="notification-list__state">
          {REFRESHING_NOTIFICATIONS_MESSAGE}
        </p>
      )}
      <ol aria-label={NOTIFICATION_LIST_LABEL} aria-busy={isFetching} className="notification-list">
        {items.map((notification) => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            isMarkReadPending={markReadPendingId === notification.id}
            onMarkRead={onMarkRead}
          />
        ))}
      </ol>
    </>
  );
}
