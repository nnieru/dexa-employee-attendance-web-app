import { createFileRoute } from '@tanstack/react-router';
import { NotificationInboxPage } from '../../features/notifications/components/notification-inbox-page.js';
import { notificationInboxSearchSchema } from '../../features/notifications/types/notification-inbox-search.schema.js';

// The page's cursors live in the URL, so a reload or a Back press shows the same page of the inbox.
export const Route = createFileRoute('/_authenticated/notifications')({
  validateSearch: notificationInboxSearchSchema,
  component: NotificationsRoute,
});

function NotificationsRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <NotificationInboxPage
      search={search}
      onCursorsChange={(cursors) =>
        // No cursors leaves the parameter out, so the first page keeps a short address.
        void navigate({
          search: (previous) => ({
            ...previous,
            cursors: cursors.length > 0 ? [...cursors] : undefined,
          }),
        })
      }
    />
  );
}
