import { IconButton } from '@dexa/ui';
import {
  NEXT_PAGE_LABEL,
  NOTIFICATION_PAGER_LABEL,
  PREVIOUS_PAGE_LABEL,
} from '../utils/notification-inbox-messages.js';

type NotificationInboxPagerProps = {
  pageNumber: number;
  hasNextPage: boolean;
  isBusy: boolean;
  onPreviousPage: () => void;
  onNextPage: () => void;
};

/**
 * Previous and next controls. The API gives no total, so the pager shows the page number only, never "of N".
 */
export function NotificationInboxPager({
  pageNumber,
  hasNextPage,
  isBusy,
  onPreviousPage,
  onNextPage,
}: NotificationInboxPagerProps) {
  const isFirstPage = pageNumber <= 1;
  return (
    <nav aria-label={NOTIFICATION_PAGER_LABEL} className="notification-pager">
      <IconButton
        aria-label={PREVIOUS_PAGE_LABEL}
        iconName="chevron-left"
        disabled={isBusy || isFirstPage}
        onClick={onPreviousPage}
      />
      <span className="notification-pager__status">{`Page ${pageNumber}`}</span>
      <IconButton
        aria-label={NEXT_PAGE_LABEL}
        iconName="chevron-right"
        disabled={isBusy || !hasNextPage}
        onClick={onNextPage}
      />
    </nav>
  );
}
