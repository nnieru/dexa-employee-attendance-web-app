import type { Notification } from '@dexa/contracts';
import { Alert, PageShell } from '@dexa/ui';
import { useMarkNotificationRead } from '../hooks/use-mark-notification-read.js';
import { useNotificationInbox } from '../hooks/use-notification-inbox.js';
import type { NotificationInboxSearch } from '../types/notification-inbox-search.schema.js';
import {
  getNextPageCursors,
  FIRST_PAGE_NUMBER,
  getPreviousPageCursors,
  resolveNotificationInboxPaging,
  toNotificationListQuery,
} from '../utils/notification-inbox-paging.js';
import {
  NOTIFICATION_INBOX_DESCRIPTION,
  NOTIFICATION_INBOX_TITLE,
  NOTIFICATION_MARK_READ_ERROR_MESSAGE,
} from '../utils/notification-inbox-messages.js';
import { NotificationInboxPager } from './notification-inbox-pager.js';
import { NotificationList } from './notification-list.js';

type NotificationInboxPageProps = {
  search: NotificationInboxSearch;
  /** Receives the cursors of the page to show; an empty list is the first page. */
  onCursorsChange: (cursors: ReadonlyArray<string>) => void;
};

const NO_ITEMS: ReadonlyArray<Notification> = [];

/**
 * The HR notification inbox (ADM-7). The URL owns the page; this component reflects it. The durable inbox is the
 * source of truth, and live delivery only refreshes it (see useNotificationStream).
 */
export function NotificationInboxPage({ search, onCursorsChange }: NotificationInboxPageProps) {
  const paging = resolveNotificationInboxPaging(search);
  const inbox = useNotificationInbox(toNotificationListQuery(paging));
  const markRead = useMarkNotificationRead();
  const page = inbox.data;
  // The server sends a cursor only when a further page exists (null on the last page).
  const nextCursor = page?.nextCursor ?? undefined;

  return (
    <PageShell
      as="div"
      title={NOTIFICATION_INBOX_TITLE}
      description={NOTIFICATION_INBOX_DESCRIPTION}
    >
      {markRead.isError && <Alert variant="error">{NOTIFICATION_MARK_READ_ERROR_MESSAGE}</Alert>}
      <NotificationList
        items={page?.items ?? NO_ITEMS}
        isFirstPage={paging.pageNumber === FIRST_PAGE_NUMBER}
        isPending={inbox.isPending}
        isFetching={inbox.isFetching}
        hasError={inbox.isError}
        markReadPendingId={markRead.isPending ? markRead.variables : undefined}
        onMarkRead={(notificationId) => markRead.mutate(notificationId)}
        onRetry={() => void inbox.refetch()}
      />
      <NotificationInboxPager
        pageNumber={paging.pageNumber}
        hasNextPage={nextCursor !== undefined}
        isBusy={inbox.isFetching}
        onPreviousPage={() => onCursorsChange(getPreviousPageCursors(paging))}
        onNextPage={() => {
          if (nextCursor !== undefined) onCursorsChange(getNextPageCursors(paging, nextCursor));
        }}
      />
    </PageShell>
  );
}
