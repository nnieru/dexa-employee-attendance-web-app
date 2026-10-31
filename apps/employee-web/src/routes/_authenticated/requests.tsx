import { createFileRoute } from '@tanstack/react-router';
import { ComingSoonPage } from '../../app/coming-soon-page.js';

// Placeholder until the requests page (T-REQ-15) is built.
export const Route = createFileRoute('/_authenticated/requests')({
  component: RequestsPlaceholderPage,
});

function RequestsPlaceholderPage() {
  return (
    <ComingSoonPage title="Requests" description="Ask for overtime or an attendance correction." />
  );
}
