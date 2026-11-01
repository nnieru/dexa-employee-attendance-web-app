import { createFileRoute } from '@tanstack/react-router';
import { ComingSoonPage } from '../../app/coming-soon-page.js';

// Placeholder until the correction request form (T-REQ-17) is built.
export const Route = createFileRoute('/_authenticated/requests_/corrections/new')({
  component: NewCorrectionRequestPlaceholderPage,
});

function NewCorrectionRequestPlaceholderPage() {
  return (
    <ComingSoonPage
      title="Request correction"
      description="Ask HR to correct a day's attendance."
    />
  );
}
