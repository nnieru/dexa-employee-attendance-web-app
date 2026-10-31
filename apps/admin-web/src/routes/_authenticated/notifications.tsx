import { createFileRoute } from '@tanstack/react-router';
import { ComingSoonPage } from '../../app/coming-soon-page.js';

// Placeholder until the notification inbox (T-AWEB-08) is built.
export const Route = createFileRoute('/_authenticated/notifications')({
  component: NotificationsPlaceholderPage,
});

function NotificationsPlaceholderPage() {
  return (
    <ComingSoonPage title="Notifications" description="Profile changes and other HR alerts." />
  );
}
