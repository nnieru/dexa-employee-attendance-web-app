import { createFileRoute } from '@tanstack/react-router';
import { ComingSoonPage } from '../../app/coming-soon-page.js';

// Placeholder until the overtime request form (T-REQ-16) is built.
export const Route = createFileRoute('/_authenticated/requests_/overtime/new')({
  component: NewOvertimeRequestPlaceholderPage,
});

function NewOvertimeRequestPlaceholderPage() {
  return (
    <ComingSoonPage title="Request overtime" description="Ask HR to approve extra working hours." />
  );
}
