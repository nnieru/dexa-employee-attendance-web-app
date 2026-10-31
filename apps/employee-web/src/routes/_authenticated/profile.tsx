import { createFileRoute } from '@tanstack/react-router';
import { ComingSoonPage } from '../../app/coming-soon-page.js';

// Placeholder until the profile view (T-EWEB-03) is built.
export const Route = createFileRoute('/_authenticated/profile')({
  component: ProfilePlaceholderPage,
});

function ProfilePlaceholderPage() {
  return <ComingSoonPage title="Profile" description="Your contact details and photo." />;
}
